import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/server/auth/auth-config";
import { safeNext } from "@/server/auth/safe-next";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|assets|fonts).*)"],
};

/**
 * Public path prefixes. A request is public if its pathname is the bare
 * prefix OR is a child of the prefix (i.e. `${p}/...`). Bare prefix without
 * a trailing slash (e.g. `/loginfoo`) does NOT match — that's intentional
 * to close a previous startsWith() over-match.
 */
const PUBLIC_PREFIXES = ["/login", "/accept-invite", "/dev"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Auth gate (Next.js 16 `proxy` convention — replaces the legacy
 * `middleware` file name as of Next 16.x).
 *
 * - `/api/**`: never redirected. BFF handlers own the 401 contract
 *   (`{ code: "AUTH_REQUIRED" }`) — the browser fetcher redirects.
 * - `/login`, `/accept-invite`, `/dev/*`: public.
 * - Everything else: requires a session. Unauthenticated users are
 *   bounced to `/login?next=<original path>`.
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
