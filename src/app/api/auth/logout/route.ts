import { NextResponse } from "next/server";

import { signOut } from "@/server/auth/auth-config";
import { revokeBackendSession } from "@/server/auth/backend-token-exchange";
import { clearActiveSession, readActiveSession } from "@/server/auth/session-token";
import { isSafeOriginalUri } from "@/shared/config/auth-config";

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

  const requestUrl = new URL(request.url);
  const nextParam = requestUrl.searchParams.get("next");
  const target = isSafeOriginalUri(nextParam) ? nextParam : "/login";
  return NextResponse.redirect(new URL(target, requestUrl), { status: 302 });
}

function isSameOriginRequest(request: Request): boolean {
  const requestUrl = new URL(request.url);
  const expectedOrigin = requestUrl.origin;
  const headerOrigin = request.headers.get("origin");
  if (headerOrigin) {
    return headerOrigin === expectedOrigin;
  }
  // Origin is missing on some same-origin POSTs (older browsers); fall back
  // to Referer when present and reject when both are absent.
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === expectedOrigin;
    } catch {
      return false;
    }
  }
  return false;
}
