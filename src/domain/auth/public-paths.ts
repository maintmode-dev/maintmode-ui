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
 * Public path prefixes. A path is public if it equals the bare prefix or is a
 * child of it (`${p}/...`). A bare prefix without the slash — `/loginfoo` — does
 * NOT match; that exactness closes a previous `startsWith()` over-match.
 */
export const PUBLIC_PREFIXES = ["/login", "/accept-invite", "/dev"] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
