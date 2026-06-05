import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { isSameOriginRequest } from "@/server/backend/security/csrf";

const ALLOWED = new Set(["approve", "start", "complete", "cancel"]);

// Action payloads (approve revision + conflict snapshot, cancel reason) are
// tiny; cap the forwarded body so a crafted request can't buffer an arbitrary
// amount of memory on the BFF before relaying it to the backend.
const MAX_BODY_BYTES = 16 * 1024;

/**
 * POST /api/maintenance/{id}/actions/{action} — proxies one of the four
 * state-transition endpoints on the backend:
 *   approve  → POST /api/v1/maintenances/{id}/approve
 *   start    → POST /api/v1/maintenances/{id}/start
 *   complete → POST /api/v1/maintenances/{id}/complete
 *   cancel   → POST /api/v1/maintenances/{id}/cancel
 *
 * Security: same-origin CSRF check (defense-in-depth on top of the
 * SameSite=Lax NextAuth cookie). The body is forwarded as-is — the caller
 * sends the backend-shaped payload directly: `approve` →
 * `{ observed_maint_revision, conflicts_snapshot }` (`apimodels.ApproveDraftMaintRequest`),
 * `cancel` → `{ reason, comment }`. Backend returns 409 on a stale revision
 * and 400 on validation — those propagate to the browser through
 * routeErrorResponse and surface as toast notifications in the mutation hooks.
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

    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Request body too large", code: "BODY_TOO_LARGE" }, { status: 413 });
    }
    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Request body too large", code: "BODY_TOO_LARGE" }, { status: 413 });
    }

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
