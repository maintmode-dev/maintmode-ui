import { describe, expect, it } from "vitest";

import { isPublicPath } from "@/domain/auth/public-paths";

/**
 * The list had no test until RUK-292 added an entry to it, and the entry it
 * added is the one where being wrong is worst.
 *
 * If `/auth/oauth` is not public, `src/proxy.ts` bounces the receiver to
 * `/login?next=/auth/oauth/callback%3Fcode=…` — which does not merely break
 * sign-in. It writes the live one-time code into a URL, into browser history and
 * into anything that logs request lines, and burns it without a session.
 */
describe("isPublicPath", () => {
  // Callers pass a pathname with no query string — `src/proxy.ts` keeps
  // `pathname` and `search` apart — so every case here is a bare path.

  it.each(["/login", "/login/", "/accept-invite", "/auth/oauth/callback", "/dev/showcase"])(
    "treats %s as public",
    (path) => {
      expect(isPublicPath(path)).toBe(true);
    },
  );

  it.each(["/", "/calendar", "/admin/audit-log", "/maintenance/new"])("treats %s as private", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });

  /**
   * The exactness that gives the entries their teeth: a bare prefix match would
   * make `/loginfoo` and `/auth/oauthfoo` public, which is the over-match the
   * module's own comment says was deliberately closed.
   */
  it.each(["/loginfoo", "/accept-invitefoo", "/auth/oauthfoo", "/devfoo"])(
    "does not over-match %s",
    (path) => {
      expect(isPublicPath(path)).toBe(false);
    },
  );
});
