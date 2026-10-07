import { NextResponse } from "next/server";

import { signOut } from "@/server/auth/auth-config";
import { revokeBackendSession } from "@/server/auth/backend-token-exchange";
import { clearActiveSession, readActiveSession } from "@/server/auth/session-token";
import { safeNext } from "@/server/auth/safe-next";
import { isSameOriginRequest } from "@/server/backend/security/csrf";

/**
 * Revokes the backend refresh token via `POST /api/v1/logout` and clears the
 * NextAuth jwt cookie. Always succeeds for the browser even when backend
 * revocation fails (e.g. token already expired); the cookie is the source of
 * truth for the frontend session.
 *
 * CSRF: this route deletes the session, so a cross-site form-post must not
 * be able to log the user out. We check that `Origin` (or, fallback, the
 * `Referer`) matches the host the request was sent to. NextAuth's built-in
 * `signOut` server action is the recommended primary path (used by the app
 * header); this route stays as a fallback for forms / external links.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin logout is not allowed", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  const session = await readActiveSession();
  if (session) {
    try {
      await revokeBackendSession(session.accessToken, session.refreshToken);
    } catch {
      // Backend may already have invalidated the refresh token; clearing the
      // cookie is what matters for the browser.
    }
  }

  await signOut({ redirect: false });
  await clearActiveSession();

  const nextParam = new URL(request.url).searchParams.get("next");
  // `safeNext`, the one sanitizer every other redirect uses: it rejects TAB and
  // the other control characters a URL parser strips (security review
  // 2026-10-07, L-2). Its `/` fallback becomes `/login` here, where it was
  // headed anyway once the session is gone.
  const sanitized = nextParam ? safeNext(nextParam) : "/";
  const target = sanitized === "/" ? "/login" : sanitized;
  // Relative on purpose. Behind a proxy, standalone Next builds `request.url`
  // from the address it listens on (http://0.0.0.0:3000), so resolving the
  // target against it sent the browser there. The browser resolves a relative
  // Location against the URL it actually used; `safeNext` keeps the
  // target a same-origin path.
  return new NextResponse(null, { status: 302, headers: { location: target } });
}
