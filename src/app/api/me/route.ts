import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";

/**
 * GET /api/me — proxy to backend `GET /api/v1/me`. Returns the current
 * authenticated user with roles + connected_providers. AppShell and
 * UserSettingsPage consume this. Frontend's `useMeQuery` falls back to
 * a mock fixture if this route is unavailable (transitional in phase 5).
 */
export async function GET() {
  try {
    const data = await authenticatedBackendRequest<unknown>({
      path: "/api/v1/me",
      method: "GET",
      useAuthBase: true,
    });
    return NextResponse.json(data);
  } catch (error) {
    return routeErrorResponse(error);
  }
}
