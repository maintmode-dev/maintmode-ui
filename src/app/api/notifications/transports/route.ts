import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import type { TransportsResponseDto } from "@/server/backend/contracts/maintmode-dto";
import { mapTransports } from "@/server/backend/contracts/notify-channel-mapper";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";

/**
 * GET /api/notifications/transports — proxy to `GET /api/v1/notifications/transports`.
 *
 * Returns the catalog of transports a channel can be created on as
 * `{ transports: [{ id, title, transportStatus }] }`, mapped to domain shape
 * here (D-2) — since RUK-198 the catalog carries delivery-health semantics
 * (`transport_status`), not just labels. Per-transport channel-id field copy
 * still comes from the UI descriptor table keyed by `id`.
 */
export async function GET() {
  try {
    const dto = await authenticatedBackendRequest<TransportsResponseDto>({
      path: "/api/v1/notifications/transports",
      method: "GET",
    });
    return NextResponse.json({ transports: mapTransports(dto) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
