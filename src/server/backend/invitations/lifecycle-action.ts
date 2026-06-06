import "server-only";

import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { requireAdminSession } from "@/server/auth/require-admin";
import { isSameOriginRequest } from "@/server/backend/security/csrf";

/**
 * Shared handler for the two admin invitation lifecycle POSTs
 * (`resend` / `revoke`). Both take only the path `{id}`, carry no body, and
 * return `204` from the auth backend. A `409` (resend on a non-pending
 * invitation, or revoke on an already-accepted one) propagates through
 * `routeErrorResponse` to the calling hook's toast.
 */
export async function handleInvitationAction(
  request: Request,
  id: string,
  action: "resend" | "revoke",
): Promise<NextResponse> {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    await requireAdminSession();
    await authenticatedBackendRequest<unknown>({
      path: `/api/v1/users/invitations/${encodeURIComponent(id)}/${action}`,
      method: "POST",
      useAuthBase: true,
    });
    // Backend answers 204; mirror that — there is no body to relay.
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
