import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";

/**
 * GET /api/maintenance/{id} — proxy to backend `GET /ui/v1/maintenances/{id}`.
 * The `/ui/v1` shape includes the precomputed `actions`/`conflicts`/
 * `snapshot_id` envelope the UI consumes directly per frozen decision.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await authenticatedBackendRequest<unknown>({
      path: `/ui/v1/maintenances/${encodeURIComponent(id)}`,
      method: "GET",
    });
    return NextResponse.json(data);
  } catch (error) {
    return routeErrorResponse(error);
  }
}
