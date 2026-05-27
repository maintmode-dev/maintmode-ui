import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { isSameOriginRequest } from "@/server/backend/security/csrf";

const ALLOWED = new Set(["approve", "start", "complete", "cancel"]);

/**
 * POST /api/maintenance/{id}/actions/{action} — proxies one of the four
 * state-transition endpoints on the backend:
 *   approve  → POST /api/v1/maintenances/{id}/approve
 *   start    → POST /api/v1/maintenances/{id}/start
 *   complete → POST /api/v1/maintenances/{id}/complete
 *   cancel   → POST /api/v1/maintenances/{id}/cancel
 *
 * Security: same-origin CSRF check (defense-in-depth on top of the
 * SameSite=Lax NextAuth cookie). The body (e.g. cancel reason,
 * snapshot_id for approve) is forwarded as-is. Backend returns 409 on
 * snapshot divergence and 400 on validation — those propagate to the
 * browser through routeErrorResponse and surface as toast notifications
 * in the mutation hooks.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    const { id, action } = await params;
    if (!ALLOWED.has(action)) {
      return NextResponse.json({ error: "Unknown action", code: "BAD_ACTION" }, { status: 400 });
    }
    const body = await request.text();
    const data = await authenticatedBackendRequest<unknown>({
      path: `/api/v1/maintenances/${encodeURIComponent(id)}/${action}`,
      method: "POST",
      body: body.length ? body : undefined,
      headers: body.length ? { "content-type": "application/json" } : undefined,
    });
    return NextResponse.json(data ?? { ok: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
