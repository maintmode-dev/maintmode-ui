/**
 * Which routes are reachable without a session.
 *
 * Lives in `src/domain/**` because BOTH sides need it and neither can import the
 * other: `src/proxy.ts` gates requests with it (and pulls in `src/server/**`,
 * which `src/features/**` may not — see `scripts/check-boundaries.mjs`), while
 * `TimezoneProvider` uses it to decide whether asking for `/api/me` is even
 * meaningful.
 *
 * Why the provider cares: it sits in the ROOT provider tree, so it mounts on
 * public pages too. Calling `/api/me` there 401s, and `bffFetch` answers an
 * `AUTH_REQUIRED` 401 by navigating to `/login?next=<current path>` — on `/login`
 * itself that is a redirect to `/login`, i.e. an infinite refresh loop with
 * `next=` nesting one level deeper each pass. Keep this list in sync with nothing:
 * it IS the single source of truth.
 */

/**
 * `/auth/oauth` is the receiver for the backend's OAuth dance (RUK-292). It has
 * to be public: it runs precisely when no session exists yet. Left private, the
 * gate below would bounce it to `/login?next=/auth/oauth/callback%3Fcode=…`,
 * putting the live one-time code into a URL, into history, and into anything
 * that logs request lines — and burning it without a sign-in.
 *
 * A prefix rather than the exact route, matching `/dev`: the dance may grow a
 * sibling, and a prefix widened under time pressure is how a private route goes
 * public by accident. Anything added under it must be safe without a session.
 *
 * Public path prefixes. A path is public if it equals the bare prefix or is a
 * child of it (`${p}/...`). A bare prefix without the slash — `/loginfoo` — does
 * NOT match; that exactness closes a previous `startsWith()` over-match.
 */
export const PUBLIC_PREFIXES = ["/login", "/accept-invite", "/auth/oauth", "/dev"] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
