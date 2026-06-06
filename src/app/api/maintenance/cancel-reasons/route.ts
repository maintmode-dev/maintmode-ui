import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { mapCancelReasonView } from "@/server/backend/contracts/maintenance-mapper";
import type { MaintenanceCancelReasonDto } from "@/server/backend/contracts/maintmode-dto";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import type { MaintenanceCancelReason } from "@/domain/maintenance/maintenance";

/**
 * GET /api/maintenance/cancel-reasons — proxy to backend
 * `GET /api/v1/maintenances/cancel-reasons`.
 *
 * Replaces the hardcoded reason enum in the cancel dialog with the
 * backend-supplied title/description text (RUK-62). The endpoint returns an
 * array of `uimodels.MaintenanceCancelReason`; `mapCancelReasonView` validates
 * each `value` against the known enum and drops any the UI can't submit, so
 * the dialog never renders an unselectable reason.
 */
export async function GET() {
  try {
    const dto = await authenticatedBackendRequest<MaintenanceCancelReasonDto[]>({
      path: "/api/v1/maintenances/cancel-reasons",
      method: "GET",
    });

    const reasons: MaintenanceCancelReason[] = (dto ?? [])
      .map(mapCancelReasonView)
      .filter((r): r is MaintenanceCancelReason => r !== null);
    return NextResponse.json({ reasons });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
