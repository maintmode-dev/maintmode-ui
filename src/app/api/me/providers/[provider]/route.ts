import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { isSameOriginRequest } from "@/server/backend/security/csrf";

/**
 * Unlinks a sign-in provider from the signed-in account (GAP-2).
 *
 * Proxies `DELETE /api/v1/me/providers/{provider}/disconnect`. The backend owns
 * the lockout rule — it refuses to remove the last way in with a 400 — and that
 * refusal is passed through as an error, never swallowed into a 204 that would
 * leave the card claiming a provider was removed when it was not.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    const { provider } = await params;
    await authenticatedBackendRequest<unknown>({
      path: `/api/v1/me/providers/${encodeURIComponent(provider)}/disconnect`,
      method: "DELETE",
      useAuthBase: true,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
