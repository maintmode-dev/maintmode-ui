import "server-only";

import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { requireAdminSession } from "@/server/auth/require-admin";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { isSameOriginRequest } from "@/server/backend/security/csrf";

const ROLES = new Set(["guest", "editor", "reviewer", "admin"]);

// The body is just `{ user_id, role }` — tiny. Cap the forwarded payload so a
// crafted request can't buffer arbitrary memory on the BFF before relaying it.
const MAX_BODY_BYTES = 4 * 1024;

/**
 * Shared handler for the two role-mutation BFF routes:
 *   assign → POST /api/v1/roles/assign
 *   revoke → POST /api/v1/roles/revoke
 *
 * Both take `{ user_id, role }` and return 204. Admin-gated + same-origin CSRF
 * check. The body is validated and re-serialized (not blindly forwarded) so we
 * only ever relay the two documented fields with a whitelisted role.
 *
 * Revoking the last admin's role is rejected by the backend (`is_last_admin`);
 * that error propagates through routeErrorResponse as a toast.
 */
export async function handleRoleMutation(request: Request, op: "assign" | "revoke") {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    await requireAdminSession();

    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Request body too large", code: "BODY_TOO_LARGE" }, { status: 413 });
    }
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Request body too large", code: "BODY_TOO_LARGE" }, { status: 413 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body", code: "VALIDATION_ERROR" }, { status: 400 });
    }

    const record = (parsed ?? {}) as Record<string, unknown>;
    const userId = typeof record.user_id === "string" ? record.user_id : "";
    const role = typeof record.role === "string" ? record.role : "";
    if (!userId || !ROLES.has(role)) {
      return NextResponse.json(
        { error: "user_id and a valid role are required", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    await authenticatedBackendRequest<unknown>({
      path: `/api/v1/roles/${op}`,
      method: "POST",
      useAuthBase: true,
      body: JSON.stringify({ user_id: userId, role }),
      headers: { "content-type": "application/json" },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
