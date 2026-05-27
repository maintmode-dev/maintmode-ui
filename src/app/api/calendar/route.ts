import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";

/**
 * GET /api/calendar — proxy to backend `GET /ui/v1/calendar`.
 *
 * Forwards `week_start` and `week_end` query params; returns the backend
 * payload unchanged. Frontend's `useCalendarQuery` expects the shape
 * `{ items: Maintenance[] }`.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const qs = url.searchParams.toString();
    const data = await authenticatedBackendRequest<{ items: unknown[] }>({
      path: `/ui/v1/calendar${qs ? `?${qs}` : ""}`,
      method: "GET",
    });

    return NextResponse.json(data);
  } catch (error) {
    return routeErrorResponse(error);
  }
}
