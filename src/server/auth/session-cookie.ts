import "server-only";

import { hkdf } from "node:crypto";

import { EncryptJWT, base64url, calculateJwkThumbprint, jwtDecrypt } from "jose";

import type { AuthSessionUser } from "@/server/auth/contracts";

/**
 * The session cookie: an encrypted JWT holding the backend token pair and the
 * signed-in user. The browser can neither read nor forge it, so "the browser
 * never sees a backend token" holds by construction.
 *
 * Byte-compatible with what Auth.js (`next-auth` v5) wrote, which this module
 * replaces: JWE `dir` + `A256CBC-HS512`, the key derived by HKDF-SHA256 from
 * `MAINTMODE_AUTH_SECRET` with the cookie NAME as salt and Auth.js's info
 * string, a `kid` thumbprint, `iat`/`exp`/`jti`, 15 s clock tolerance on read.
 * A session issued before the switch keeps working after it, so the release
 * signs nobody out. `session-cookie.test.ts` pins that with a token Auth.js
 * itself produced.
 */

export type SessionPayload = {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. 0 when unknown, which the reader treats as "refresh now". */
  accessTokenExpiresAt: number;
  user: AuthSessionUser;
  /**
   * Epoch ms of the sign-in that started this session, carried unchanged
   * through every refresh. The fallback for the cookie's end when the backend
   * did not report one (`sessionExpiresAt`): its default
   * `jwt.session_max_lifetime` after sign-in. Also what a build from before
   * `sessionExpiresAt` reads, so it is written even when that is known.
   * Absent in a cookie written before the field existed.
   */
  sessionStartedAt?: number;
  /**
   * Epoch ms the backend ends this session at the latest — its
   * `session_expires_at` (RUK-310): sign-in + `session_max_lifetime`, 24h for
   * break-glass. Constant for the session, so it is carried through every
   * refresh whose reply omits it. An upper bound only: the session can end
   * earlier (idle, logout, revocation), which the refresh 401 handles. Absent
   * when the backend never sent it (a backend from before RUK-310).
   */
  sessionExpiresAt?: number;
};

/** Under https the cookie carries `__Secure-`, which a browser only accepts with `Secure`. */
export const SESSION_COOKIE = "authjs.session-token";
export const SECURE_SESSION_COOKIE = "__Secure-authjs.session-token";

/**
 * Every name a session may be found under, in reading order: ours, then the
 * pre-v5 `next-auth.*` names a very old session could still carry.
 */
export const SESSION_COOKIE_NAMES = [
  SESSION_COOKIE,
  SECURE_SESSION_COOKIE,
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
] as const;

/**
 * The longest a session lives, from sign-in, when the backend did not say
 * (`sessionExpiresAt` absent — a backend from before RUK-310). Matches the
 * backend's default `jwt.session_max_lifetime` (720h); the BFF has no setting
 * of its own for it.
 */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * The most a cookie may live, whatever the backend reports: the cap browsers
 * apply to `Max-Age` themselves. Applied here too so the sealed JWT `exp`
 * stays equal to the cookie's own lifetime, and a garbage far-future value
 * cannot seal a session that never expires server-side.
 */
const COOKIE_MAX_AGE_CEILING_SECONDS = 400 * 24 * 60 * 60;

/**
 * RFC 3339 date-time with an explicit zone, as Go's `time.RFC3339` writes it.
 * Checked before `Date.parse`, which reads a zone-less ISO string as
 * server-local time and accepts loose forms like "Nov 13 2026".
 */
const RFC3339_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * The backend's `session_expires_at` as epoch ms, or `undefined` for anything
 * not usable — absent, `null`, not a string, not RFC 3339 with a zone,
 * unparseable, or less than a second after `now`. The backend has just issued
 * live tokens with it, so a value not in the future is skew or garbage, and
 * honouring it would delete the cookie on the spot. `undefined` means "fall
 * back", exactly as for a backend that never sends the field.
 */
export function parseSessionExpiresAt(value: unknown, now: number): number | undefined {
  if (typeof value !== "string" || !RFC3339_WITH_ZONE.test(value)) {
    return undefined;
  }
  const at = Date.parse(value);
  if (!Number.isFinite(at) || at - now < 1000) {
    return undefined;
  }
  return at;
}

/**
 * Seconds the session cookie may live when written at `now`: until the
 * session's absolute end, never past it (RFC 10017 §6.1.2.2 — the BFF session
 * ends with the refresh token's maximum lifetime), so a refresh never re-arms
 * a fresh lifetime. The end is the backend's own `sessionExpiresAt` when it
 * reported one — not capped at 30 days, since an operator may raise
 * `session_max_lifetime` — else `sessionStartedAt` + `SESSION_MAX_AGE_SECONDS`,
 * else (a cookie from before either existed) a full `SESSION_MAX_AGE_SECONDS`
 * from now.
 */
export function sessionCookieMaxAgeSeconds(
  payload: Pick<SessionPayload, "sessionStartedAt" | "sessionExpiresAt">,
  now = Date.now(),
): number {
  if (typeof payload.sessionExpiresAt === "number" && Number.isFinite(payload.sessionExpiresAt)) {
    const remaining = Math.floor((payload.sessionExpiresAt - now) / 1000);
    return Math.min(COOKIE_MAX_AGE_CEILING_SECONDS, Math.max(0, remaining));
  }
  if (typeof payload.sessionStartedAt !== "number" || !Number.isFinite(payload.sessionStartedAt)) {
    return SESSION_MAX_AGE_SECONDS;
  }
  const remaining = Math.floor((payload.sessionStartedAt + SESSION_MAX_AGE_SECONDS * 1000 - now) / 1000);
  return Math.min(SESSION_MAX_AGE_SECONDS, Math.max(0, remaining));
}

const ALG = "dir";
const ENC = "A256CBC-HS512";
const KEY_BYTES = 64;

/**
 * The name to write a NEW session under: `__Secure-` when the app is served
 * over https, as Auth.js decided from `AUTH_URL`, which every deployment sets
 * to the same value as `MAINTMODE_APP_BASE_URL`.
 */
export function sessionCookieNameFor(appBaseUrl: string): string {
  return appBaseUrl.startsWith("https:") ? SECURE_SESSION_COOKIE : SESSION_COOKIE;
}

/**
 * Cookie attributes for a session written under `name`. `Secure` follows the
 * name rather than `NODE_ENV`: a `__Secure-` cookie without it is dropped by
 * the browser, and a plain-HTTP deployment's cookie with it is dropped too —
 * which is how a refresh on plain HTTP used to sign people out (review I-4).
 */
export function sessionCookieAttributes(name: string) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: name.startsWith("__Secure-"),
    path: "/",
  };
}

function deriveKey(secret: string, salt: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    hkdf("sha256", secret, salt, `Auth.js Generated Encryption Key (${salt})`, KEY_BYTES, (error, key) => {
      if (error) reject(error);
      else resolve(new Uint8Array(key));
    });
  });
}

function thumbprintOf(key: Uint8Array): Promise<string> {
  return calculateJwkThumbprint({ kty: "oct", k: base64url.encode(key) }, "sha512");
}

/** Seals `payload` for the cookie called `name` (the name is the key's salt). */
export async function encodeSession(
  payload: SessionPayload,
  name: string,
  secret: string,
  maxAgeSeconds = SESSION_MAX_AGE_SECONDS,
): Promise<string> {
  const key = await deriveKey(secret, name);
  const now = Math.floor(Date.now() / 1000);
  return new EncryptJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: ALG, enc: ENC, kid: await thumbprintOf(key) })
    .setIssuedAt(now)
    .setExpirationTime(now + maxAgeSeconds)
    .setJti(crypto.randomUUID())
    .encrypt(key);
}

/**
 * Opens a cookie value, or `null` for anything that is not a live, complete
 * session: wrong key, tampered, expired, a missing field, or a session Auth.js
 * had marked dead (`RefreshAccessTokenError`). Never throws — a bad cookie is
 * simply no session.
 */
export async function decodeSession(
  value: string,
  name: string,
  secret: string,
): Promise<SessionPayload | null> {
  let claims: Record<string, unknown>;
  try {
    const key = await deriveKey(secret, name);
    const { payload } = await jwtDecrypt(value, key, {
      clockTolerance: 15,
      keyManagementAlgorithms: [ALG],
      contentEncryptionAlgorithms: [ENC, "A256GCM"],
    });
    claims = payload;
  } catch {
    return null;
  }

  const { accessToken, refreshToken, accessTokenExpiresAt, user, sessionStartedAt, sessionExpiresAt, error } =
    claims as Partial<SessionPayload> & {
      error?: unknown;
    };
  if (error === "RefreshAccessTokenError") return null;
  if (typeof accessToken !== "string" || !accessToken) return null;
  if (typeof refreshToken !== "string" || !refreshToken) return null;
  if (!isSessionUser(user)) return null;
  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: typeof accessTokenExpiresAt === "number" ? accessTokenExpiresAt : 0,
    user,
    ...(typeof sessionStartedAt === "number" && Number.isFinite(sessionStartedAt)
      ? { sessionStartedAt }
      : {}),
    ...(typeof sessionExpiresAt === "number" && Number.isFinite(sessionExpiresAt)
      ? { sessionExpiresAt }
      : {}),
  };
}

function isSessionUser(value: unknown): value is AuthSessionUser {
  const user = value as Partial<AuthSessionUser> | null;
  return typeof user?.id === "string" && Array.isArray(user.roles);
}
