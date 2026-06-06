import "server-only";

import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { isSameOriginRequest } from "@/server/backend/security/csrf";

/**
 * Shared handler for the two resource lifecycle transitions:
 *   archive   → POST /api/v1/resource/{id}/archive
 *   unarchive → POST /api/v1/resource/{id}/unarchive
 *
 * Both are idempotent on the backend and answer `204` (EC-3): repeating the
 * call on an already-archived/active resource still succeeds, so we relay the
 * empty body straight through as a 204. Same-origin CSRF guard, no request
 * body to forward.
 */
export async function handleResourceLifecycle(
  request: Request,
  id: string,
  action: "archive" | "unarchive",
): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    await authenticatedBackendRequest<unknown>({
      path: `/api/v1/resource/${encodeURIComponent(id)}/${action}`,
      method: "POST",
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
