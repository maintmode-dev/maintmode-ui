import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { mapDraftToUpdateRequest, parseDraftBody } from "@/server/backend/contracts/maintenance-mapper";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { isSameOriginRequest } from "@/server/backend/security/csrf";

// Same envelope as create — small body, capped to keep the BFF from buffering
// an arbitrary payload before relaying it.
const MAX_BODY_BYTES = 64 * 1024;

/**
 * POST /api/maintenance/{id}/edit — update a draft maintenance.
 *
 * Proxies backend `POST /api/v1/maintenances/{id}/edit` (NOT `PATCH /{id}` —
 * that endpoint never existed; see the TODO this replaces in
 * `maintenance-edit-mode.tsx`). Body is `UpdateDraftMaintRequest`, built by
 * `mapDraftToUpdateRequest` — NOT the create mapper: update's
 * `deferred_notifications` is tri-state (omitted = unchanged, `[]` = clear,
 * non-empty = replace), so edit must send the key even when empty or
 * "uncheck everything, save" would silently keep the old reminders. The backend
 * answers `204 No Content`; we relay `{ ok: true }` so the mutation hook has a
 * resolved value to invalidate on.
 *
 * Security: same-origin CSRF check (defense-in-depth on top of the
 * SameSite=Lax NextAuth cookie).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    const { id } = await params;

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
    await authenticatedBackendRequest<unknown>({
      path: `/api/v1/maintenances/${encodeURIComponent(id)}/edit`,
      method: "POST",
      body: JSON.stringify(mapDraftToUpdateRequest(input)),
      headers: { "content-type": "application/json" },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
