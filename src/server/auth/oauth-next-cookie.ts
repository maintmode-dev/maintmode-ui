import "server-only";

import { cookies } from "next/headers";

import { safeNext } from "@/server/auth/safe-next";

/**
 * Short-lived, httpOnly cookie carrying the post-login destination across the
 * backend-driven OAuth dance (RUK-292).
 *
 * Why a cookie at all: the backend builds its return address from configuration
 * only and refuses a `return_to` parameter outright — "a redirect target taken
 * from the request is an open redirect" — so `?next=` cannot ride along with the
 * dance. Once the browser leaves for the backend, this app's own state is the
 * only place the destination can live. Without it, a deep link into a protected
 * page would silently land on `/` after sign-in.
 *
 * httpOnly, lax, secure, fifteen minutes (see `MAX_AGE_SECONDS`), single-use. `sameSite: "lax"` is load-bearing — the
 * return trip is a top-level GET navigation from another origin, which Lax
 * permits and Strict would drop.
 *
 * `read` and `clear` are SEPARATE functions and reading does not clear. A helper
 * with a hidden write is correct once and surprising forever; the caller clears
 * it in one place (`oauth-dance-actions.ts`), before any branch can return.
 *
 * It is ALSO the proof that this browser started the dance (security review
 * 2026-10-07, M-1). The receiver submits itself, so without that proof a link to
 * `/auth/oauth/callback?code=<attacker's code>` signs whoever opens it into the
 * attacker's account. `readOAuthNext` therefore tells "absent" apart from "/".
 * `__Host-` is what makes the proof worth anything: a sibling subdomain cannot
 * plant it. It implies `Secure` and `Path=/`, set and cleared with one attribute
 * object for the reason `otp-nonce-cookie.ts` gives — a `__Host-` delete without
 * `Secure` is dropped by the browser.
 */
export const OAUTH_NEXT_COOKIE = "__Host-mm.oauth_next";

/**
 * 15 min: the backend's dance state lives `auth.oauth_dance_state_ttl` (10 min by
 * default) from a moment slightly AFTER this cookie is set, and the receiver
 * still has a redirect, a render and a submit to go after the callback. Since
 * the cookie is also the receiver's proof (M-1), a cookie shorter than the
 * dance turns a slow but valid sign-in into a refusal. Raise it with that TTL.
 */
const MAX_AGE_SECONDS = 15 * 60;

// `Secure` everywhere, as `__Host-` requires. Chrome and Firefox accept that on
// http://localhost; Safari does not, so OAuth sign-in in local dev needs one of
// the former (as OTP already did).
const COOKIE_ATTRIBUTES = { httpOnly: true, sameSite: "lax", secure: true, path: "/" } as const;

export async function setOAuthNext(next: string): Promise<void> {
  const store = await cookies();
  store.set(OAUTH_NEXT_COOKIE, safeNext(next), { ...COOKIE_ATTRIBUTES, maxAge: MAX_AGE_SECONDS });
}

/**
 * Returns a destination that is always safe to redirect to — `/` when the cookie
 * is empty or holds something `safeNext` rejects — or `null` when there is no
 * cookie at all, meaning this browser did not start a dance in the last ten
 * minutes.
 *
 * Sanitized on READ as well as on write. The value spends the dance in the
 * browser, which is exactly the place a stored value stops being ours; trusting
 * it back unchecked is how an open redirect gets in through the side door.
 */
export async function readOAuthNext(): Promise<string | null> {
  const store = await cookies();
  const cookie = store.get(OAUTH_NEXT_COOKIE);
  if (!cookie) {
    return null;
  }
  return cookie.value ? safeNext(cookie.value) : "/";
}

export async function clearOAuthNext(): Promise<void> {
  const store = await cookies();
  store.delete({ name: OAUTH_NEXT_COOKIE, ...COOKIE_ATTRIBUTES });
}
