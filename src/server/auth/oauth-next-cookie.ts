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
 * Modeled on `invitation-cookie.ts`, deliberately: same attributes, same
 * lifetime, same single-use discipline. `sameSite: "lax"` is load-bearing — the
 * return trip is a top-level GET navigation from another origin, which Lax
 * permits and Strict would drop.
 *
 * `read` and `clear` are SEPARATE functions and reading does not clear. A helper
 * with a hidden write is correct once and surprising forever; the caller clears
 * it in one place (`oauth-dance-actions.ts`), before any branch can return.
 */
export const OAUTH_NEXT_COOKIE = "mm.oauth_next";

const MAX_AGE_SECONDS = 10 * 60; // 10 min — one dance, matching the invitation cookie.

export async function setOAuthNext(next: string): Promise<void> {
  const store = await cookies();
  store.set(OAUTH_NEXT_COOKIE, safeNext(next), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/**
 * Returns a destination that is always safe to redirect to — `/` when the cookie
 * is absent, empty, or holds something `safeNext` rejects.
 *
 * Sanitized on READ as well as on write. The value spends the dance in the
 * browser, which is exactly the place a stored value stops being ours; trusting
 * it back unchecked is how an open redirect gets in through the side door.
 */
export async function readOAuthNext(): Promise<string> {
  const store = await cookies();
  const value = store.get(OAUTH_NEXT_COOKIE)?.value;
  return value ? safeNext(value) : "/";
}

export async function clearOAuthNext(): Promise<void> {
  const store = await cookies();
  store.delete(OAUTH_NEXT_COOKIE);
}
