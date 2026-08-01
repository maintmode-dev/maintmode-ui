import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { canApprove, canWrite } from "@/domain/auth/permissions";
import { isPublicPath } from "@/domain/auth/public-paths";
import { auth } from "@/server/auth/auth-config";
import { safeNext } from "@/server/auth/safe-next";

export const config = {
  // `icon.svg` is the App-Router-generated favicon (src/app/icon.svg); exclude
  // it like favicon.ico so the auth middleware doesn't rewrite the icon request
  // to the page shell (which left the browser's favicon fetch 404-ing).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|assets|fonts).*)"],
};

// The prefix list moved to `@/domain/auth/public-paths` so the client can share
// it: `TimezoneProvider` mounts on public pages and must NOT ask for `/api/me`
// there — that 401 sends `bffFetch` to `/login`, which on `/login` is a refresh
// loop. Two copies of this list would drift into exactly that bug.

/**
 * Auth gate (Next.js 16 `proxy` convention — replaces the legacy
 * `middleware` file name as of Next 16.x).
 *
 * - `/api/**`: never redirected. BFF handlers own the 401 contract
 *   (`{ code: "AUTH_REQUIRED" }`) — the browser fetcher redirects.
 * - `/login`, `/accept-invite`, `/dev/*`: public.
 * - Everything else: requires a session. Unauthenticated users are
 *   bounced to `/login?next=<original path>`.
 * - `/approvals`: also requires an approve-capable role (reviewer/admin);
 *   others are silently redirected to `/`.
 * - `/admin/*`: also requires `roles.includes("admin")`; non-admins
 *   are silently redirected to `/`.
 * - Signed-in users hitting `/login` are bounced to `/`.
 *
 * Local-only escape hatch: `MAINTMODE_DISABLE_AUTH_GUARD=1` bypasses the
 * gate. The check is HARD-GATED by `NODE_ENV !== "production"` so a
 * leaked env-var on a production deploy cannot disable auth.
 */
export default auth((request: NextRequest & { auth: AuthSession | null }) => {
  const { pathname, search } = request.nextUrl;

  // A session whose backend token can no longer be refreshed
  // (`RefreshAccessTokenError`) is effectively dead: every BFF call 401s.
  // Treat it as unauthenticated here, otherwise we get an infinite
  // `/` ⇄ `/login` redirect loop — the page 401s and `bffFetch` redirects to
  // `/login`, but a still-"valid" cookie would bounce the user straight back
  // to `/`, which 401s again. Collapsing it to null breaks the loop and lets
  // the user re-authenticate.
  const session = request.auth?.error === "RefreshAccessTokenError" ? null : request.auth;

  // Local-only escape hatch. Inverted control flow: the production branch
  // explicitly does NOTHING with the flag — even reading it is suspicious —
  // so a misreading of the check (e.g. negated condition) cannot accidentally
  // disable the gate in production.
  if (process.env.NODE_ENV !== "production") {
    if (process.env.MAINTMODE_DISABLE_AUTH_GUARD === "1") {
      return NextResponse.next();
    }
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (pathname === "/login" || pathname === "/login/") {
    if (session) {
      return NextResponse.redirect(new URL("/", request.nextUrl));
    }
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!session) {
    const loginUrl = new URL("/login", request.nextUrl);
    loginUrl.searchParams.set("next", safeNext(`${pathname}${search}`));
    return NextResponse.redirect(loginUrl);
  }

  // `/maintenance/new` is the only create-only route; hide-the-CTA covers the
  // UI, this is defense-in-depth against a deep-link. Exact match (not
  // startsWith) so a hypothetical `/maintenance/newer` is not over-matched.
  if (pathname === "/maintenance/new" && !canWrite(session.user?.roles)) {
    return NextResponse.redirect(new URL("/", request.nextUrl));
  }

  // `/approvals` mirrors the backend gate on GET /ui/v1/approvals, which is
  // scoped to the approve scenario rather than to plain read: a queue called
  // "awaiting my approval" is not a page an editor sees empty, it is a page an
  // editor does not have. Hiding the nav item covers the UI; this turns a
  // deep-link into a clean redirect instead of an error state. Exact match, so
  // a future `/approvals/<id>` is not silently swept in under this rule.
  if (pathname === "/approvals" && !canApprove(session.user?.roles)) {
    return NextResponse.redirect(new URL("/", request.nextUrl));
  }

  if (pathname.startsWith("/admin/")) {
    const roles = session.user?.roles ?? [];
    if (!roles.includes("admin")) {
      return NextResponse.redirect(new URL("/", request.nextUrl));
    }
  }

  return NextResponse.next();
});

interface AuthSession {
  user?: { roles?: string[] };
  /** Set when the backend token could not be refreshed; see the gate above. */
  error?: string;
}
