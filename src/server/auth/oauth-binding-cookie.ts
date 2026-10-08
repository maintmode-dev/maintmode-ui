import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { cookies } from "next/headers";

/**
 * The browser binding of an OAuth dance (security review 2026-10-07, M-1 /
 * backend L1 and M1).
 *
 * The receiver submits itself, so without a binding a link carrying someone
 * else's fresh code — or link code — signs whoever opens it into that account,
 * or attaches that identity to theirs. The binding ties the code to the browser
 * that started the dance:
 *
 *  - before the browser leaves for `/start`, a random nonce is kept here, in an
 *    httpOnly cookie, and `/start` receives only `binding = base64url(SHA-256(nonce))`;
 *  - the backend carries the binding through the dance onto the one-time code;
 *  - redeeming the code takes the nonce itself as `binding_proof`, which only
 *    this cookie holds.
 *
 * The hash, not the nonce, travels through the URL: the `/start` address passes
 * through browser history and the gateway's logs, and what it shows must not be
 * enough to redeem anything. Contract agreed with the backend
 * (`internal/services/auth/dance_binding.go`): unpadded base64url both ways,
 * the hash taken over the nonce's ASCII bytes.
 *
 * `__Host-`, `Secure`, httpOnly, lax — the same attributes and reasoning as
 * `oauth-next-cookie.ts`, and the same fifteen minutes, longer than the
 * backend's dance state. One cookie per browser: a second dance started in
 * another tab replaces the first one's nonce, and the first is then refused.
 */
export const OAUTH_BINDING_COOKIE = "__Host-mm.oauth_binding";

const MAX_AGE_SECONDS = 15 * 60;

const COOKIE_ATTRIBUTES = { httpOnly: true, sameSite: "lax", secure: true, path: "/" } as const;

/** `base64url(SHA-256(nonce))`, unpadded — what `/start` receives as `binding`. */
export function bindingFor(nonce: string): string {
  return createHash("sha256").update(nonce, "ascii").digest("base64url");
}

/**
 * Mints a fresh nonce, keeps it in the cookie, and returns the binding to put on
 * the `/start` URL. Fresh on every dance, never reused: a nonce that outlived
 * its dance would bind the next one too.
 */
export async function mintOAuthBinding(): Promise<string> {
  const nonce = randomBytes(32).toString("base64url");
  const store = await cookies();
  store.set(OAUTH_BINDING_COOKIE, nonce, { ...COOKIE_ATTRIBUTES, maxAge: MAX_AGE_SECONDS });
  return bindingFor(nonce);
}

/** The nonce to send as `binding_proof`, or `null` when this browser holds none. */
export async function readOAuthBindingProof(): Promise<string | null> {
  const store = await cookies();
  return store.get(OAUTH_BINDING_COOKIE)?.value || null;
}

/** Cleared with the attributes it was written with — see `oauth-next-cookie.ts`. */
export async function clearOAuthBinding(): Promise<void> {
  const store = await cookies();
  store.delete({ name: OAUTH_BINDING_COOKIE, ...COOKIE_ATTRIBUTES });
}
