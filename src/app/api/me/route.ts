import { NextResponse } from "next/server";

import { signOut } from "@/server/auth/auth-config";
import { clearActiveSession } from "@/server/auth/session-token";
import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { BackendRequestError } from "@/server/backend/errors/backend-request-error";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";

/**
 * GET /api/me — proxy to backend `GET /api/v1/me`. Returns the current
 * authenticated user with roles + connected_providers. AppShell and
 * UserSettingsPage consume this.
 *
 * A backend **404** here means the access token is valid JWT-wise but the
 * user no longer exists (deleted account / stale session) — the browser cookie
 * outlives the backend record. We treat that as an auth failure: clear this
 * browser's NextAuth + active-session cookies and return the same
 * `401 AUTH_REQUIRED` envelope a 401 would, so `bffFetch` redirects to /login
 * and the dead session can't linger or loop.
 */
export async function GET() {
  try {
    const data = await authenticatedBackendRequest<unknown>({
      path: "/api/v1/me",
      method: "GET",
      useAuthBase: true,
    });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof BackendRequestError && error.status === 404) {
      await signOut({ redirect: false });
      await clearActiveSession();
      return NextResponse.json(
        {
          error: "Sign-in is required",
          code: "AUTH_REQUIRED",
          hint: "The account for this session no longer exists. Re-authenticate via /login.",
        },
        { status: 401 },
      );
    }
    return routeErrorResponse(error);
  }
}
