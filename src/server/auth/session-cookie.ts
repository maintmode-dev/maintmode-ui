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

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

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

  const { accessToken, refreshToken, accessTokenExpiresAt, user, error } =
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
  };
}

function isSessionUser(value: unknown): value is AuthSessionUser {
  const user = value as Partial<AuthSessionUser> | null;
  return typeof user?.id === "string" && Array.isArray(user.roles);
}
