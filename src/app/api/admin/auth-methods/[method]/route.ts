import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { requireAdminSession } from "@/server/auth/require-admin";
import { routeErrorResponse, BffValidationError } from "@/server/backend/errors/bff-error";
import { isSameOriginRequest } from "@/server/backend/security/csrf";
import { readCappedJsonBody } from "@/server/backend/http/read-json-body";
import type { AuthMethodSettingDto } from "@/server/backend/contracts/auth-methods-dto";

/**
 * Body cap for this route. A local constant, not the integrations one.
 *
 * `INTEGRATION_MAX_BODY_BYTES` holds the same number, but importing it would
 * give an auth route a dependency on the integrations module — the coupling
 * these two screens are deliberately kept free of — to bound a body of about
 * twenty bytes.
 */
const AUTH_METHOD_MAX_BODY_BYTES = 64 * 1024;

/**
 * PATCH /api/admin/auth-methods/{method} — proxy to
 * `PATCH /api/v1/auth/settings/{method}` on the AUTH backend. Admin-only.
 *
 * Body is `{ enabled }` — the TARGET STATE, not a flip. A toggle that inverted
 * whatever it found would turn a double-click into a silent re-enable of a
 * method the admin had just closed.
 *
 * ## The method name is forwarded, never validated here
 *
 * The closed set in `src/domain/auth/auth-method-settings.ts` exists for
 * LABELS. Gating this route on it would mean the screen renders a method the
 * backend reported (as it must — the row is a sign-in path already in force)
 * and then refuses to toggle it with a locally invented 400. The backend owns
 * method validity and answers 404 for anything outside its own set.
 *
 * `useAuthBase: true` for the same reason as the list route: without it the
 * request goes to the maintmode backend and 404s, which reads exactly like the
 * backend not having shipped yet.
 *
 * There is no 409. The backend had a guard refusing to disable the last enabled
 * method and removed it before merge: an instance offering no built-in sign-in
 * is a legitimate SSO-only configuration, and it is not a lockout — sessions
 * survive, break-glass answers regardless, and the same state was already
 * reachable through the integration registry. 404 is the only refusal a
 * well-formed request from an admin can now get.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ method: string }> }) {
  // Outside the `try`, like every other mutating admin route: this answers with
  // its own envelope rather than going through `routeErrorResponse`.
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    await requireAdminSession();
    const { method } = await params;
    const body = await readCappedJsonBody<{ enabled?: unknown }>(request, AUTH_METHOD_MAX_BODY_BYTES);
    if (typeof body.enabled !== "boolean") {
      throw new BffValidationError([{ field: "enabled", message: "enabled must be an explicit boolean" }]);
    }

    const dto = await authenticatedBackendRequest<AuthMethodSettingDto>({
      path: `/api/v1/auth/settings/${encodeURIComponent(method)}`,
      method: "PATCH",
      useAuthBase: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: body.enabled }),
    });

    return NextResponse.json(dto);
  } catch (error) {
    return routeErrorResponse(error);
  }
}
