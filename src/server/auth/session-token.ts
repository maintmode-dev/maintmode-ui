import "server-only";

import { cookies } from "next/headers";

import { parseMaintmodeAuthConfig, type MaintmodeAuthConfig } from "@/shared/config/auth-config";
import { refreshBackendToken } from "@/server/auth/backend-token-exchange";
import {
  BackendAuthError,
  type AuthSessionUser,
  type BackendRefreshReply,
  type BackendTokenPair,
} from "@/server/auth/contracts";
import {
  SESSION_COOKIE_NAMES,
  decodeSession,
  encodeSession,
  sessionCookieAttributes,
  sessionCookieMaxAgeSeconds,
  sessionCookieNameFor,
  type SessionPayload,
} from "@/server/auth/session-cookie";
import { BackendUnavailableError } from "@/server/backend/errors/backend-request-error";
import { logError } from "@/server/observability/error-log";

export type { SessionPayload } from "@/server/auth/session-cookie";

const REFRESH_LEEWAY_MS = 60_000;

/**
 * How long a SETTLED refresh stays the answer for the token it spent.
 *
 * Longer than the backend's 30s grace window on purpose. A request that left
 * the browser before the winner's rotated cookie came back still carries the
 * old refresh token; within this window it gets the very pair the winner got —
 * so every cookie written for that rotation holds identical tokens — instead of
 * spending the old token again: a grace reply at best, and past the grace
 * window reuse detection, which revokes the whole session.
 */
export const REFRESH_RESULT_TTL_MS = 60_000;

/** Delay before the one retry when the backend sent no usable `Retry-After`. */
const REFRESH_RETRY_DEFAULT_DELAY_MS = 250;
/** Cap on an honoured `Retry-After`: the user's request is waiting on it. */
const REFRESH_RETRY_MAX_DELAY_MS = 2_000;

/**
 * A refresh that could not be completed for a reason that says nothing about
 * the session — the backend's lock was busy (429, or the documented 409), it
 * failed (5xx), it was unreachable, or it answered something unusable — and
 * failed again on the one retry. The session cookie is KEPT: only this request
 * fails. A `BackendUnavailableError`, so BFF routes answer it with 503
 * `BACKEND_UNAVAILABLE` rather than the 401 that would send the browser to
 * /login while it still holds a live session.
 */
export class SessionRefreshUnavailableError extends BackendUnavailableError {
  constructor(cause: unknown) {
    super(cause);
    this.name = "SessionRefreshUnavailableError";
  }
}

/** Never legitimate; see `refreshOnce`. Ends the session like a backend 401. */
class CrossUserRefreshError extends Error {
  constructor() {
    super("refresh token already in flight for another user");
    this.name = "CrossUserRefreshError";
  }
}

type CookieEntry = {
  name: string;
  value: string;
};

let cachedAuthConfig: MaintmodeAuthConfig | null = null;

function getAuthConfig(): MaintmodeAuthConfig {
  if (!cachedAuthConfig) {
    cachedAuthConfig = parseMaintmodeAuthConfig(process.env);
  }
  return cachedAuthConfig;
}

/** A refresh reply and when it arrived, which is what its expiry counts from. */
type RefreshResult = {
  reply: BackendRefreshReply;
  receivedAt: number;
};

/**
 * Refreshes in flight AND recently settled, keyed by the refresh token spent.
 *
 * This module is one instance per server process, shared by every request of
 * every user. The key is what keeps that safe: only callers holding the SAME
 * refresh token — the same session, typically parallel requests from one tab —
 * share a backend call. A process-wide single slot used to hand user B the
 * token pair minted for user A whenever their refreshes overlapped.
 *
 * A successful refresh stays here for `REFRESH_RESULT_TTL_MS` after it settled
 * (see there for why), and is evicted lazily on the next refresh after that, so
 * the map holds at most the refreshes of the last minute or so. A failed one is
 * dropped at once: a failure must not stay the answer for its token.
 *
 * Only the backend call is shared. Writing or clearing the cookie happens in
 * each caller's own request context, see `refreshAndPersist`.
 *
 * `userId` is the session the refresh was started for. A caller presenting the
 * same token under another user is refused rather than given the pair: that
 * state cannot arise legitimately, and handing tokens out on it is exactly the
 * leak this map exists to prevent.
 */
type RefreshEntry = {
  userId: string;
  result: Promise<RefreshResult>;
  /** Epoch ms the refresh succeeded; null while in flight. */
  settledAt: number | null;
};

const refreshes = new Map<string, RefreshEntry>();

/**
 * Starts a session from a token pair the backend just issued: writes the
 * session cookie under the name this deployment uses (`__Secure-` over https)
 * and removes any other session cookie, so one browser never carries two.
 *
 * Refuses a pair it could not keep alive — no refresh token, or no usable
 * expiry — by throwing rather than writing a session that dies at the first
 * rotation, minutes later and far from here. Callers map the throw to their
 * flow's failure code.
 */
export async function establishSession(
  pair: BackendTokenPair,
  user: AuthSessionUser,
): Promise<SessionPayload> {
  const expiresIn =
    typeof pair.expires_in === "number" && Number.isFinite(pair.expires_in) ? pair.expires_in : 0;
  if (!pair.access_token || !pair.refresh_token || expiresIn <= 0) {
    throw new Error("token pair cannot sustain a session");
  }
  const now = Date.now();
  const payload: SessionPayload = {
    accessToken: pair.access_token,
    refreshToken: pair.refresh_token,
    accessTokenExpiresAt: now + expiresIn * 1000,
    user,
    // The sign-in instant, carried through every refresh: the cookie ends when
    // the session does (`sessionCookieMaxAgeSeconds`).
    sessionStartedAt: now,
  };
  const name = sessionCookieNameFor(getAuthConfig().appBaseUrl);
  await clearActiveSession();
  await writeSessionCookie(name, payload);
  return payload;
}

/**
 * Who is signed in, WITHOUT refreshing: for server components and the proxy,
 * which must not rotate tokens (a page render cannot write the cookie, and a
 * second refresh path spending the same token is what used to sign people out
 * — review L-1). Rotation belongs to `readActiveSession`, on the BFF side.
 */
export async function readSessionUser(): Promise<AuthSessionUser | null> {
  const cookieStore = await cookies();
  return readSessionUserFrom(cookieStore);
}

/** Same as `readSessionUser`, over any cookie reader — the proxy passes `request.cookies`. */
export async function readSessionUserFrom(store: {
  get(name: string): { value: string } | undefined;
}): Promise<AuthSessionUser | null> {
  for (const name of SESSION_COOKIE_NAMES) {
    const value = store.get(name)?.value;
    if (value) {
      const session = await decodeSession(value, name, getAuthConfig().authSecret);
      return session?.user ?? null;
    }
  }
  return null;
}

/**
 * Reads the session cookie server-side. When the access token is close
 * to expiry (within `REFRESH_LEEWAY_MS`) the call transparently runs a
 * refresh and persists the rotated tokens back into the cookie. Returns
 * `null` when there is no usable session: none at all, or one the backend has
 * definitively ended (see `endsSession`), whose cookie is cleared.
 *
 * Throws `SessionRefreshUnavailableError` when the refresh could not be
 * completed for a transient reason AND the access token has already expired.
 * While it still has time left (inside the leeway) the session is returned as
 * it is — the token works, and the next request tries the refresh again.
 */
export async function readActiveSession(): Promise<SessionPayload | null> {
  const entry = await readSessionCookieEntry();
  if (!entry) {
    return null;
  }
  const decoded = await decodeSessionCookie(entry);
  if (!decoded) {
    return null;
  }
  if (!isExpiring(decoded)) {
    return decoded;
  }
  try {
    return await refreshAndPersist(entry, decoded);
  } catch (error) {
    if (error instanceof SessionRefreshUnavailableError && hasTimeLeft(decoded)) {
      return decoded;
    }
    throw error;
  }
}

/**
 * Forces a refresh-and-persist regardless of the current expiry. Used by
 * the authenticated backend wrapper after the backend rejected the request
 * with `401`, so the next retry uses a freshly rotated access token.
 *
 * Concurrent callers holding the same refresh token share one backend call;
 * callers with different tokens never do. Returns `null` and clears the cookie
 * only when the backend definitively ended the session; a transient failure
 * throws `SessionRefreshUnavailableError` and leaves the cookie alone.
 */
export async function forceSessionRefresh(): Promise<SessionPayload | null> {
  const entry = await readSessionCookieEntry();
  if (!entry) {
    return null;
  }
  const decoded = await decodeSessionCookie(entry);
  if (!decoded) {
    return null;
  }
  return refreshAndPersist(entry, decoded);
}

/**
 * "Is anyone signed in?" for the Server Actions that refuse to run while a
 * session is live. Unlike `readSessionUser` it refreshes, because an action may
 * write the cookie a refresh rotates. A session whose refresh is momentarily
 * unavailable is still a session: it counts as signed in, never as signed out.
 */
export async function hasActiveSession(): Promise<boolean> {
  try {
    return (await readActiveSession()) !== null;
  } catch (error) {
    if (error instanceof SessionRefreshUnavailableError) {
      return true;
    }
    throw error;
  }
}

/**
 * The session to sign out, or `null`. For logout only: a refresh that is
 * momentarily unavailable must not stop a sign-out, so it reads as "no
 * session to revoke" and the caller goes on to clear the cookie.
 */
export async function readActiveSessionForSignOut(): Promise<SessionPayload | null> {
  try {
    return await readActiveSession();
  } catch (error) {
    if (error instanceof SessionRefreshUnavailableError) {
      return null;
    }
    throw error;
  }
}

/**
 * Clears every known session cookie. Called on logout, before a new session is
 * written, and when the backend has definitively ended the session.
 */
export async function clearActiveSession(): Promise<void> {
  const cookieStore = await cookies();
  for (const name of SESSION_COOKIE_NAMES) {
    if (cookieStore.get(name)) {
      cookieStore.set({ name, value: "", ...sessionCookieAttributes(name), maxAge: 0 });
    }
  }
}

async function readSessionCookieEntry(): Promise<CookieEntry | null> {
  const cookieStore = await cookies();
  for (const name of SESSION_COOKIE_NAMES) {
    const value = cookieStore.get(name)?.value;
    if (value) {
      return { name, value };
    }
  }
  return null;
}

function decodeSessionCookie(entry: CookieEntry): Promise<SessionPayload | null> {
  return decodeSession(entry.value, entry.name, getAuthConfig().authSecret);
}

function isExpiring(payload: SessionPayload): boolean {
  if (!payload.accessTokenExpiresAt) {
    return true;
  }
  return Date.now() >= payload.accessTokenExpiresAt - REFRESH_LEEWAY_MS;
}

function hasTimeLeft(payload: SessionPayload): boolean {
  return payload.accessTokenExpiresAt > Date.now();
}

/**
 * Whether a refresh failure means the session is OVER, so its cookie must go.
 *
 * Only a 401 says that. The backend answers every one of those states with
 * 401 `unauthorized` (`unauthorizedErrors` in its `httperrors/mapper.go`): an
 * unknown token (`invalid refresh token`), a rotated token replayed past its
 * grace window (`token reuse detected` — the family is revoked), a session
 * logged out (`logout already`), and one idle past 7 days or older than 30
 * from sign-in (`token expired`). A refresh token presented by two users is
 * refused here and ends the session too: it is never legitimate.
 *
 * Everything else leaves the cookie alone — see `isTransient` for which of
 * those are retried. Clearing on them signed out whichever request lost a
 * race, and its cookie-clear could reach the browser after the winner's fresh
 * cookie and undo it.
 */
function endsSession(error: unknown): boolean {
  if (error instanceof CrossUserRefreshError) {
    return true;
  }
  return error instanceof BackendAuthError && error.status === 401;
}

/**
 * Whether a refresh failure is worth one retry: the lock on that token was busy
 * (429 with `Retry-After`; swagger documents it as 409), the backend failed
 * (5xx), or it was not reached at all (network error, timeout). Other
 * answers — another 4xx, a 200 without an access token — will not change on a
 * retry, and fail the request without a second call.
 */
function isTransient(error: unknown): boolean {
  if (error instanceof BackendAuthError) {
    return error.status === 409 || error.status === 429 || error.status >= 500;
  }
  return !(error instanceof CrossUserRefreshError);
}

/** `Retry-After` in ms (delta-seconds or HTTP-date), capped; a default without one. */
function retryDelayMs(error: unknown): number {
  const header = error instanceof BackendAuthError ? error.retryAfter?.trim() : undefined;
  if (!header) {
    return REFRESH_RETRY_DEFAULT_DELAY_MS;
  }
  const delay = /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now();
  if (!Number.isFinite(delay)) {
    return REFRESH_RETRY_DEFAULT_DELAY_MS;
  }
  return Math.min(REFRESH_RETRY_MAX_DELAY_MS, Math.max(0, delay));
}

/** What a failure is, for the log: a status or an error class — never a body or a token. */
function describeFailure(error: unknown): string {
  if (error instanceof BackendAuthError) {
    return `backend answered ${error.status}`;
  }
  return error instanceof Error ? error.name : "unknown error";
}

async function refreshAndPersist(
  entry: CookieEntry,
  current: SessionPayload,
): Promise<SessionPayload | null> {
  let result: RefreshResult;
  try {
    result = await refreshOnce(current.refreshToken, current.user.id);
  } catch (error) {
    if (endsSession(error)) {
      await clearActiveSession();
      return null;
    }
    throw new SessionRefreshUnavailableError(error);
  }
  const { reply, receivedAt } = result;
  const expiresIn = typeof reply.expires_in === "number" && reply.expires_in > 0 ? reply.expires_in : 0;
  if (!expiresIn) {
    throw new SessionRefreshUnavailableError(new Error("refresh reply carried no usable expiry"));
  }
  // An empty or absent refresh token is the backend's grace reply: "keep the
  // one you have". It is never written into the cookie — the cookie keeps its
  // own refresh token — and the new access token serves this request only.
  const rotatedRefreshToken = reply.refresh_token || null;
  // `user` is the caller's own, decoded from its own cookie: the backend pair
  // carries no identity, and it was minted for this caller's refresh token.
  // The expiry counts from when the reply ARRIVED, so a caller served from
  // `refreshes` a while later does not stretch it.
  const next: SessionPayload = {
    accessToken: reply.access_token,
    refreshToken: rotatedRefreshToken ?? current.refreshToken,
    accessTokenExpiresAt: receivedAt + expiresIn * 1000,
    user: current.user,
    ...(current.sessionStartedAt !== undefined ? { sessionStartedAt: current.sessionStartedAt } : {}),
  };
  if (rotatedRefreshToken) {
    // Under the name it was found under: the name is the encryption key's salt.
    await writeSessionCookie(entry.name, next);
  }
  return next;
}

function refreshOnce(refreshToken: string, userId: string): Promise<RefreshResult> {
  evictSettledRefreshes(Date.now());
  const existing = refreshes.get(refreshToken);
  if (existing) {
    if (existing.userId === userId) {
      return existing.result;
    }
    // Logged because it is never legitimate: one refresh token inside two
    // users' sealed cookies means a leaked AUTH_SECRET or a bug here. Neither
    // the token nor the ids are written — the event alone is the signal.
    logError({
      level: "ERROR",
      msg: "refresh token presented by two different users",
      err: "refused cross-user refresh",
    });
    return Promise.reject(new CrossUserRefreshError());
  }
  const result = refreshWithOneRetry(refreshToken);
  const entry: RefreshEntry = { userId, result, settledAt: null };
  refreshes.set(refreshToken, entry);
  // Registered before any caller awaits `result`, so the bookkeeping is done by
  // the time they resume. It handles the rejection for itself only; every
  // caller still receives it.
  result.then(
    () => {
      entry.settledAt = Date.now();
    },
    () => {
      if (refreshes.get(refreshToken) === entry) {
        refreshes.delete(refreshToken);
      }
    },
  );
  return result;
}

function evictSettledRefreshes(now: number): void {
  for (const [token, entry] of refreshes) {
    if (entry.settledAt !== null && now - entry.settledAt >= REFRESH_RESULT_TTL_MS) {
      refreshes.delete(token);
    }
  }
}

/**
 * One backend refresh, retried ONCE on a transient failure after the backend's
 * `Retry-After` (capped). The retry shares the slot in `refreshes`, so callers
 * that joined meanwhile get its outcome rather than starting their own. A retry
 * after a lost reply or a busy lock usually meets a token rotated a moment ago,
 * which the backend answers with its grace reply.
 */
async function refreshWithOneRetry(refreshToken: string): Promise<RefreshResult> {
  try {
    return await requestRefresh(refreshToken);
  } catch (error) {
    if (!isTransient(error)) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs(error)));
    try {
      return await requestRefresh(refreshToken);
    } catch (retryError) {
      if (!endsSession(retryError)) {
        logError({
          level: "ERROR",
          msg: "session refresh failed twice; session kept, request failed",
          err: describeFailure(retryError),
        });
      }
      throw retryError;
    }
  }
}

async function requestRefresh(refreshToken: string): Promise<RefreshResult> {
  const reply = await refreshBackendToken(refreshToken);
  return { reply, receivedAt: Date.now() };
}

async function writeSessionCookie(name: string, payload: SessionPayload): Promise<void> {
  // The cookie and the sealed JWT inside it both end with the session: never
  // past `sessionStartedAt` + the backend's maximum lifetime.
  const maxAge = sessionCookieMaxAgeSeconds(payload);
  const cookieStore = await cookies();
  cookieStore.set({
    name,
    value: await encodeSession(payload, name, getAuthConfig().authSecret, maxAge),
    ...sessionCookieAttributes(name),
    maxAge,
  });
}
