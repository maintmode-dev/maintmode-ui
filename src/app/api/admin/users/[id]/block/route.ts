import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { requireAdminSession } from "@/server/auth/require-admin";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { isSameOriginRequest } from "@/server/backend/security/csrf";

/**
 * POST /api/admin/users/{id}/block — proxy to auth
 * `POST /api/v1/users/{id}/block` (admin-only). Idempotent on the backend;
 * revokes refresh tokens, roles are preserved. No body. Backend returns 204.
 *
 * Blocking the last admin is rejected by the backend (`is_last_admin`); that
 * error propagates through routeErrorResponse and surfaces as a toast.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    await requireAdminSession();
    const { id } = await params;
    await authenticatedBackendRequest<unknown>({
      path: `/api/v1/users/${encodeURIComponent(id)}/block`,
      method: "POST",
      useAuthBase: true,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
