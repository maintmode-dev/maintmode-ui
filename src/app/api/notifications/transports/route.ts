import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import type { TransportsResponseDto } from "@/server/backend/contracts/maintmode-dto";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";

/**
 * GET /api/notifications/transports — proxy to `GET /api/v1/notifications/transports`.
 *
 * Returns the catalog of transports a channel can be created on as
 * `{ transports: [{ id, title }] }`. The backend entries carry only id/title;
 * the channel-create form supplies the per-transport channel-id label /
 * placeholder / help copy from a UI descriptor table keyed by `id`.
 */
export async function GET() {
  try {
    const dto = await authenticatedBackendRequest<TransportsResponseDto>({
      path: "/api/v1/notifications/transports",
      method: "GET",
    });
    return NextResponse.json({ transports: dto.transports ?? [] });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
