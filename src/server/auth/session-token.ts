import "server-only";

import { cookies } from "next/headers";
import { decode, encode } from "next-auth/jwt";

import { parseMaintmodeAuthConfig, type MaintmodeAuthConfig } from "@/shared/config/auth-config";
import { refreshBackendToken } from "@/server/auth/backend-token-exchange";
import type { AuthSessionUser, BackendTokenPair } from "@/server/auth/contracts";
import { logError } from "@/server/observability/error-log";

const REFRESH_LEEWAY_MS = 60_000;
const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
] as const;
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export type SessionPayload = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  user: AuthSessionUser;
};

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

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
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
 * Reads the NextAuth jwt cookie server-side. When the access token is close
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
 * Clears every known NextAuth session cookie. Called on logout and when a
 * refresh-and-retry cycle has irrecoverably failed.
 */
export async function clearActiveSession(): Promise<void> {
  const cookieStore = await cookies();
  for (const name of SESSION_COOKIE_NAMES) {
    if (cookieStore.get(name)) {
      cookieStore.set({
        name,
        value: "",
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction(),
        path: "/",
        maxAge: 0,
      });
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

async function decodeSessionCookie(entry: CookieEntry): Promise<SessionPayload | null> {
  const config = getAuthConfig();
  const decoded = (await decode({
    token: entry.value,
    secret: config.authSecret,
    salt: entry.name,
  })) as (Partial<SessionPayload> & { error?: string }) | null;

  if (!decoded?.accessToken || !decoded.refreshToken || !decoded.user) {
    return null;
  }
  if (decoded.error === "RefreshAccessTokenError") {
    return null;
  }
  return {
    accessToken: decoded.accessToken,
    refreshToken: decoded.refreshToken,
    accessTokenExpiresAt: typeof decoded.accessTokenExpiresAt === "number" ? decoded.accessTokenExpiresAt : 0,
    user: decoded.user,
  };
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
  const config = getAuthConfig();
  const cookieStore = await cookies();
  const encoded = await encode({
    token: payload as unknown as Record<string, unknown>,
    secret: config.authSecret,
    salt: entry.name,
    maxAge: MAX_AGE_SECONDS,
  });
  cookieStore.set({
    name: entry.name,
    value: encoded,
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}
