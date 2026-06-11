import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { mapAuditLogResponse } from "@/server/backend/contracts/audit-mapper";
import type { AuditLogResponseDto } from "@/server/backend/contracts/maintmode-dto";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";

/**
 * GET /api/audit — proxy to backend `GET /api/v1/audit/log` (auth base).
 *
 * Read-only global security log feed. The backend does the filtering, paging,
 * and category counting; we forward the whitelisted query params and fold the
 * `apiauthmodels.AuditLogResponse` (`{ logs, total, facets }`) into the domain
 * `AuditPage` the page consumes. `action` is a CSV of `AuditAction` values.
 */
const FORWARDED_PARAMS = ["limit", "offset", "action", "actor", "created_from", "created_to"] as const;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const forwarded = new URLSearchParams();
    for (const key of FORWARDED_PARAMS) {
      const value = url.searchParams.get(key);
      if (value != null && value !== "") forwarded.set(key, value);
    }
    const qs = forwarded.toString();
    const dto = await authenticatedBackendRequest<AuditLogResponseDto>({
      path: `/api/v1/audit/log${qs ? `?${qs}` : ""}`,
      method: "GET",
      useAuthBase: true,
    });
    return NextResponse.json(mapAuditLogResponse(dto));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
