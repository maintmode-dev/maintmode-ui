import { NextResponse } from "next/server";

import { signOut } from "@/server/auth/auth-config";
import { revokeAllBackendSessions } from "@/server/auth/backend-token-exchange";
import { clearActiveSession, readActiveSession } from "@/server/auth/session-token";
import { safeNext } from "@/server/auth/safe-next";
import { isSameOriginRequest } from "@/server/backend/security/csrf";

/**
 * Signs the account out on ALL devices: revokes every refresh token via
 * `POST /api/v1/logout/all`, then clears this browser's NextAuth jwt +
 * active-session cookies and redirects to /login.
 *
 * Unlike `/api/auth/logout` (this device only), the backend revoke is what
 * actually invalidates the other sessions — but we still clear local cookies
 * and redirect even if it fails, so the local sign-out always completes.
 *
 * CSRF: this route deletes sessions, so a cross-site form-post must not be able
 * to trigger it — we require a same-origin `Origin`/`Referer`.
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
      await revokeAllBackendSessions(session.accessToken);
    } catch {
      // Best-effort: even if the backend revoke fails, clear this browser's
      // session so the local sign-out still happens.
    }
  }

  await signOut({ redirect: false });
  await clearActiveSession();

  const nextParam = new URL(request.url).searchParams.get("next");
  // `safeNext`, the one sanitizer every other redirect uses: it rejects TAB and
  // the other control characters a URL parser strips (security review
  // 2026-10-07, L-2). Its `/` fallback becomes `/login` here, where it was
  // headed anyway once the session is gone.
  const sanitized = safeNext(nextParam ?? "");
  const target = sanitized === "/" ? "/login" : sanitized;
  // Relative on purpose. Behind a proxy, standalone Next builds `request.url`
  // from the address it listens on (http://0.0.0.0:3000), so resolving the
  // target against it sent the browser there. The browser resolves a relative
  // Location against the URL it actually used; `safeNext` keeps the
  // target a same-origin path.
  return new NextResponse(null, { status: 302, headers: { location: target } });
}
