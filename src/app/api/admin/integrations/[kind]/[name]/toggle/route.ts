import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { requireAdminSession } from "@/server/auth/require-admin";
import { routeErrorResponse, BffValidationError } from "@/server/backend/errors/bff-error";
import { isSameOriginRequest } from "@/server/backend/security/csrf";
import { readJsonBody } from "@/server/backend/http/read-json-body";
import { mustMapIntegration } from "@/server/backend/contracts/integrations-mapper";
import type { IntegrationDto } from "@/server/backend/contracts/integrations-dto";
import { resolveIntegrationParams } from "@/server/backend/contracts/integration-route-params";

/**
 * POST /api/admin/integrations/{kind}/{name}/toggle — proxy to
 * `POST /api/v1/integrations/{kind}/{name}/toggle`. Flips the enabled flag
 * without touching config or secrets. 404 = the pair is not configured.
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
    const { kind, name } = await resolveIntegrationParams(params);
    const body = await readJsonBody<{ enabled?: unknown }>(request);
    if (typeof body.enabled !== "boolean") {
      throw new BffValidationError([{ field: "enabled", message: "enabled must be an explicit boolean" }]);
    }
    const dto = await authenticatedBackendRequest<IntegrationDto>({
      path: `/api/v1/integrations/${kind}/${name}/toggle`,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: body.enabled }),
    });
    return NextResponse.json(mustMapIntegration(dto));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
