import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { requireAdminSession } from "@/server/auth/require-admin";
import { routeErrorResponse, BffValidationError } from "@/server/backend/errors/bff-error";
import { isSameOriginRequest } from "@/server/backend/security/csrf";
import { readJsonBody } from "@/server/backend/http/read-json-body";
import { resolveIntegrationParams } from "@/server/backend/contracts/integration-route-params";

/**
 * POST /api/admin/integrations/{kind}/{name}/test — proxy to
 * `POST /api/v1/integrations/notify/email/test`.
 *
 * Sends a real message using the settings in the body, saving nothing and
 * recording nothing. That is what separates it from the create/update routes,
 * and it is why the guards below matter more here than on a read: this handler
 * makes the backend open an outbound connection to a host the caller chose, and
 * send mail to an address the caller chose.
 *
 * Parameterised by `[kind]/[name]` like its siblings even though the backend
 * pins its own route to `notify/email`: a literal segment here would sit beside
 * the existing dynamic ones, and the pair whitelist — the cheapest of the three
 * guards — would have nothing to check.
 *
 * The OUTGOING path is a literal for the same reason it must be: interpolating
 * the segments produced `/notify/test` when the route moved, which is a
 * well-formed string and therefore a runtime 404 rather than a build error.
 *
 * Guard order follows `toggle`: origin first, before any work is done, because
 * this handler sends mail; then the session; then the pair.
 */
export async function POST(request: Request, { params }: { params: Promise<{ kind: string; name: string }> }) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    await requireAdminSession();
    // Two guards, two messages, deliberately not collapsed into one condition:
    // "not a routable integration" and "this one has no probe" are different
    // facts, and an operator reading the second should not be told the first.
    const { name } = await resolveIntegrationParams(params);
    // A live probe is defined for SMTP only; the other transports have no
    // equivalent and the backend exposes no route for them.
    if (name !== "email") {
      throw new BffValidationError([{ field: "name", message: "Test send is only available for email" }]);
    }

    const body = await readJsonBody<{ config?: unknown; secrets?: unknown; to?: unknown }>(request);
    if (typeof body.to !== "string" || body.to.trim() === "") {
      throw new BffValidationError([{ field: "to", message: "A recipient address is required" }]);
    }

    // Forwarded verbatim: the point of this endpoint is to test what the
    // operator is looking at, so anything reshaped here would test something
    // else. The backend validates the config and rejects unknown secret keys.
    await authenticatedBackendRequest<void>({
      path: "/api/v1/integrations/notify/email/test",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config: body.config ?? {}, secrets: body.secrets ?? {}, to: body.to }),
    });

    // 204 in, 204 out. The backend reports that the SMTP server ACCEPTED the
    // message; delivery is not claimed, and neither is it here.
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
