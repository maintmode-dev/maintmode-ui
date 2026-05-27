import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";

/**
 * GET /api/audit — proxy to backend `GET /api/v1/audit/log`.
 *
 * Read-only global security log feed. Frontend's `useGlobalAuditQuery`
 * expects `{ events: AuditEvent[] }`.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const qs = url.searchParams.toString();
    const data = await authenticatedBackendRequest<unknown>({
      path: `/api/v1/audit/log${qs ? `?${qs}` : ""}`,
      method: "GET",
      useAuthBase: true,
    });
    return NextResponse.json(data);
  } catch (error) {
    return routeErrorResponse(error);
  }
}
