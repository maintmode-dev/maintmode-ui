import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/server/auth/auth-config";

export const config = {
  // Static assets, Next.js internals, and the favicon are excluded by the
  // matcher itself; the runtime check below only has to handle dynamic
  // routes plus `/login` and `/api/**`.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|assets).*)"],
};

export default auth((request: NextRequest & { auth: unknown }) => {
  const { pathname, search } = request.nextUrl;

  // Never redirect API traffic — BFF route handlers own their own 401
  // contract (`{ code: "AUTH_REQUIRED" }`). The browser fetcher decides
  // when to send the user to /login.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (pathname === "/login" || pathname.startsWith("/login/")) {
    if (request.auth) {
      return NextResponse.redirect(new URL("/", request.nextUrl));
    }
    return NextResponse.next();
  }

  if (!request.auth) {
    const loginUrl = new URL("/login", request.nextUrl);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});
