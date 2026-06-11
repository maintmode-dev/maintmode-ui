import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { isSameOriginRequest } from "@/server/backend/security/csrf";

const ALLOWED = new Set(["start", "complete", "cancel"]);

/**
 * POST /api/maintenance/{id}/steps/{stepId}/actions/{action} — proxies one of
 * the three step-lifecycle endpoints on the backend:
 *   start    → POST /api/v1/maintenances/{id}/steps/{stepId}/start
 *   complete → POST /api/v1/maintenances/{id}/steps/{stepId}/complete
 *   cancel   → POST /api/v1/maintenances/{id}/steps/{stepId}/cancel
 *
 * These mirror the maintenance-level actions route. Step transitions take no
 * request body and return 204 on success. The backend enforces the step state
 * machine (`planned → started → completed|canceled`) and step ordering on
 * `start`; an invalid transition or out-of-order start returns 409, an unknown
 * id 404, and a non-`in_progress` maintenance 403/409. Those propagate to the
 * browser through routeErrorResponse and surface as toasts in the mutation hook.
 *
 * Security: same-origin CSRF check, matching the maintenance-actions route.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; stepId: string; action: string }> },
) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    const { id, stepId, action } = await params;
    if (!ALLOWED.has(action)) {
      return NextResponse.json({ error: "Unknown action", code: "BAD_ACTION" }, { status: 400 });
    }

    const data = await authenticatedBackendRequest<unknown>({
      path: `/api/v1/maintenances/${encodeURIComponent(id)}/steps/${encodeURIComponent(stepId)}/${action}`,
      method: "POST",
    });
    return NextResponse.json(data ?? { ok: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
