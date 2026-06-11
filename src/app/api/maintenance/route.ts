import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { mapDraftToCreateRequest, parseDraftBody } from "@/server/backend/contracts/maintenance-mapper";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { isSameOriginRequest } from "@/server/backend/security/csrf";

// A draft body (title, description, steps with rollback text) is small; cap
// the forwarded payload so a crafted request can't buffer arbitrary memory on
// the BFF before relaying it to the backend.
const MAX_BODY_BYTES = 64 * 1024;

/**
 * POST /api/maintenance — create a draft maintenance.
 *
 * Proxies backend `POST /api/v1/maintenances/create`. The browser sends the
 * domain `MaintenanceDraftInput`; `mapDraftToCreateRequest` folds it onto the
 * `apimodels.CreateDraftMaintRequest` wire shape (resources → `{ id }` refs,
 * step `duration` kept as the Go-duration string "1h30m"). The backend answers
 * with `CreateDraftMaintResponse` (`{ id, ... }`), forwarded verbatim so the
 * mutation hook can navigate to the new detail page.
 *
 * Security: same-origin CSRF check (defense-in-depth on top of the
 * SameSite=Lax NextAuth cookie).
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Request body too large", code: "BODY_TOO_LARGE" }, { status: 413 });
    }
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Request body too large", code: "BODY_TOO_LARGE" }, { status: 413 });
    }

    // Parse + structurally validate so a malformed/incomplete client body
    // becomes a 400 here rather than a `TypeError` inside the mapper (or a
    // `SyntaxError` from JSON.parse) that surfaces as 500 `BFF_ERROR`.
    const input = parseDraftBody(raw);
    const data = await authenticatedBackendRequest<unknown>({
      path: "/api/v1/maintenances/create",
      method: "POST",
      body: JSON.stringify(mapDraftToCreateRequest(input)),
      headers: { "content-type": "application/json" },
    });
    return NextResponse.json(data ?? { ok: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
