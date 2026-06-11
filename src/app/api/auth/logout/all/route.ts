import { NextResponse } from "next/server";

import { signOut } from "@/server/auth/auth-config";
import { revokeAllBackendSessions } from "@/server/auth/backend-token-exchange";
import { clearActiveSession, readActiveSession } from "@/server/auth/session-token";
import { isSameOriginRequest } from "@/server/backend/security/csrf";
import { isSafeOriginalUri } from "@/shared/config/auth-config";

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

  const requestUrl = new URL(request.url);
  const nextParam = requestUrl.searchParams.get("next");
  const target = isSafeOriginalUri(nextParam) ? nextParam : "/login";
  return NextResponse.redirect(new URL(target, requestUrl), { status: 302 });
}
