import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { mapAuditLogResponse } from "@/server/backend/contracts/audit-mapper";
import type { AuditLogResponseDto } from "@/server/backend/contracts/maintmode-dto";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";

/**
 * GET /api/audit — proxy to backend `GET /api/v1/audit/log` (auth base).
 *
 * Read-only global security log feed. The backend returns
 * `apiauthmodels.AuditLogResponse` (`{ logs: AuditLog[] }`) with flat
 * `AuditAction` values and string `details`; `mapAuditLogResponse` folds that
 * into the `{ events: AuditEvent[] }` shape `useGlobalAuditQuery` consumes,
 * dropping rows with an unmapped action.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const qs = url.searchParams.toString();
    const dto = await authenticatedBackendRequest<AuditLogResponseDto>({
      path: `/api/v1/audit/log${qs ? `?${qs}` : ""}`,
      method: "GET",
      useAuthBase: true,
    });
    return NextResponse.json({ events: mapAuditLogResponse(dto) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
