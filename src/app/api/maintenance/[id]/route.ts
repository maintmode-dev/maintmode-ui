import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { mapMaintenanceView } from "@/server/backend/contracts/maintenance-mapper";
import type { MaintenanceViewResponseDto } from "@/server/backend/contracts/maintmode-dto";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";

/**
 * GET /api/maintenance/{id} — proxy to backend `GET /ui/v1/maintenances/{id}`.
 *
 * The backend returns `uimodels.MaintenanceViewResponse`
 * (`{ maintenance, actions, conflicts }`) with flat `*_time_*` fields, an
 * integer `revision`, and `created_by`/`approver` user summaries. The
 * `mapMaintenanceView` adapter folds that envelope into the domain
 * `MaintenanceDetail` (nested periods, integer `revision`, author/approver
 * display strings) the UI consumes.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const dto = await authenticatedBackendRequest<MaintenanceViewResponseDto>({
      path: `/ui/v1/maintenances/${encodeURIComponent(id)}`,
      method: "GET",
    });
    return NextResponse.json(mapMaintenanceView(dto));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
