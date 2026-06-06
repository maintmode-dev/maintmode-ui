import { NextResponse } from "next/server";

import { backendRequest } from "@/server/backend/client/backend-client";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { projectInvitationPreview } from "@/server/backend/invitations/preview-projection";

/**
 * GET /api/invitations/preview?token= — public proxy to the auth backend
 * `GET /api/v1/users/invitations/preview?token=` (no auth).
 *
 * Privacy contract (frozen): the backend already returns ONLY
 * `{ status, suggested_provider? }` — never email, roles, or inviter. We
 * re-project to exactly those two fields anyway so a future backend change
 * cannot accidentally leak PII through this public route. An unknown/empty
 * token yields `status: "invalid"` with HTTP 200 (anti-enumeration), so we
 * never translate that into a 404.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token") ?? "";

    const data = await backendRequest<unknown>({
      path: `/api/v1/users/invitations/preview?token=${encodeURIComponent(token)}`,
      method: "GET",
      useAuthBase: true,
    });

    // Re-project defensively: surface only status + suggested_provider.
    return NextResponse.json(projectInvitationPreview(data));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
