import "server-only";

import { cookies } from "next/headers";

import { parseMaintmodeAuthConfig, type MaintmodeAuthConfig } from "@/shared/config/auth-config";
import { refreshBackendToken } from "@/server/auth/backend-token-exchange";
import type { AuthSessionUser, BackendTokenPair } from "@/server/auth/contracts";
import {
  SESSION_COOKIE_NAMES,
  SESSION_MAX_AGE_SECONDS,
  decodeSession,
  encodeSession,
  sessionCookieAttributes,
  sessionCookieNameFor,
  type SessionPayload,
} from "@/server/auth/session-cookie";
import { logError } from "@/server/observability/error-log";

export type { SessionPayload } from "@/server/auth/session-cookie";

const REFRESH_LEEWAY_MS = 60_000;

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

/**
 * Refreshes in flight, keyed by the refresh token being spent.
 *
 * This module is one instance per server process, shared by every request of
 * every user. The key is what keeps that safe: only callers holding the SAME
 * refresh token — the same session, typically parallel requests from one tab —
 * share a backend call. A process-wide single slot used to hand user B the
 * token pair minted for user A whenever their refreshes overlapped.
 *
 * Only the backend call is shared. Writing or clearing the cookie happens in
 * each caller's own request context, see `refreshAndPersist`.
 *
 * `userId` is the session the refresh was started for. A caller presenting the
 * same token under another user is refused rather than given the pair: that
 * state cannot arise legitimately, and handing tokens out on it is exactly the
 * leak this map exists to prevent.
 */
type InFlightRefresh = {
  userId: string;
  pair: Promise<BackendTokenPair>;
};

const inFlightRefreshes = new Map<string, InFlightRefresh>();

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
  const payload: SessionPayload = {
    accessToken: pair.access_token,
    refreshToken: pair.refresh_token,
    accessTokenExpiresAt: Date.now() + expiresIn * 1000,
    user,
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
 * `null` when there is no usable session.
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
  return refreshAndPersist(entry, decoded.refreshToken, decoded.user);
}

/**
 * Forces a refresh-and-persist regardless of the current expiry. Used by
 * the authenticated backend wrapper after the backend rejected the request
 * with `401`, so the next retry uses a freshly rotated access token.
 *
 * Concurrent callers holding the same refresh token share one backend call;
 * callers with different tokens never do. If the refresh fails the session
 * cookie is cleared so middleware sees a logged-out state on the next request.
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
  return refreshAndPersist(entry, decoded.refreshToken, decoded.user);
}

/**
 * Clears every known session cookie. Called on logout, before a new session is
 * written, and when a refresh-and-retry cycle has irrecoverably failed.
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

async function refreshAndPersist(
  entry: CookieEntry,
  refreshToken: string,
  user: AuthSessionUser,
): Promise<SessionPayload | null> {
  let refreshed: BackendTokenPair;
  try {
    refreshed = await refreshOnce(refreshToken, user.id);
  } catch {
    await clearActiveSession();
    return null;
  }
  const expiresIn =
    typeof refreshed.expires_in === "number" && refreshed.expires_in > 0 ? refreshed.expires_in : 0;
  if (!expiresIn) {
    await clearActiveSession();
    return null;
  }
  // `user` is the caller's own, decoded from its own cookie: the backend pair
  // carries no identity, and it was minted for this caller's refresh token.
  const next: SessionPayload = {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    accessTokenExpiresAt: Date.now() + expiresIn * 1000,
    user,
  };
  await persistRefreshedSession(entry, next);
  return next;
}

function refreshOnce(refreshToken: string, userId: string): Promise<BackendTokenPair> {
  const existing = inFlightRefreshes.get(refreshToken);
  if (existing) {
    if (existing.userId === userId) {
      return existing.pair;
    }
    // Logged because it is never legitimate: one refresh token inside two
    // users' sealed cookies means a leaked AUTH_SECRET or a bug here. Neither
    // the token nor the ids are written — the event alone is the signal.
    logError({
      level: "ERROR",
      msg: "refresh token presented by two different users",
      err: "refused cross-user refresh",
    });
    return Promise.reject(new Error("refresh token already in flight for another user"));
  }
  const pair = refreshBackendToken(refreshToken).finally(() => {
    inFlightRefreshes.delete(refreshToken);
  });
  inFlightRefreshes.set(refreshToken, { userId, pair });
  return pair;
}

async function persistRefreshedSession(entry: CookieEntry, payload: SessionPayload): Promise<void> {
  // Under the name it was found under: the name is the encryption key's salt.
  await writeSessionCookie(entry.name, payload);
}

async function writeSessionCookie(name: string, payload: SessionPayload): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set({
    name,
    value: await encodeSession(payload, name, getAuthConfig().authSecret),
    ...sessionCookieAttributes(name),
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}
