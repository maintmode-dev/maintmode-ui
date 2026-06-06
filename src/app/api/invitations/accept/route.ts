import { NextResponse } from "next/server";

import { isSameOriginRequest } from "@/server/backend/security/csrf";
import { setInvitationToken } from "@/server/auth/invitation-cookie";

/**
 * POST /api/invitations/accept — public entry point for claiming an invitation
 * (RUK-160). This does NOT itself exchange tokens; it binds the invitation to
 * the OAuth round-trip and hands off to NextAuth.
 *
 * Flow:
 *  1. `/accept-invite` submits `{ token, provider }` here (same-origin form).
 *  2. We stash the raw invitation token in a short-lived httpOnly cookie.
 *  3. We 303-redirect into the NextAuth provider sign-in. After the provider
 *     returns, the `signIn` callback sees the cookie and calls the backend
 *     accept endpoint (instead of a plain login exchange), creating the user
 *     and establishing the session — all server-side.
 *
 * Security: the backend access/refresh tokens never touch the browser; only
 * the NextAuth session cookie is set. Same-origin CSRF check guards the cookie
 * write. The invitation token rides in an httpOnly cookie, never in a URL, so
 * it does not leak via Referer/history.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  const form = await request.formData().catch(() => null);
  const token = form?.get("token");

  const origin = new URL(request.url).origin;

  if (typeof token !== "string" || token.length === 0) {
    // No token to bind — bounce to the page's missing-link state rather than
    // starting a bare login that would create an unrelated session.
    return NextResponse.redirect(new URL("/accept-invite", origin), { status: 303 });
  }

  await setInvitationToken(token);

  // Only Google is wired today (RUK-92 adds the rest), so the provider is fixed
  // here regardless of the form hint. Hand off to NextAuth's provider sign-in;
  // on success NextAuth redirects to the app root, where AppShell loads the
  // freshly established session.
  const signInUrl = new URL("/api/auth/signin/google", origin);
  signInUrl.searchParams.set("callbackUrl", "/");

  return NextResponse.redirect(signInUrl, { status: 303 });
}
