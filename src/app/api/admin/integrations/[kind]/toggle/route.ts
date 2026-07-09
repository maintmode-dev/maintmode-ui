import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { requireAdminSession } from "@/server/auth/require-admin";
import { routeErrorResponse, BffValidationError } from "@/server/backend/errors/bff-error";
import { isSameOriginRequest } from "@/server/backend/security/csrf";
import { readJsonBody } from "@/server/backend/http/read-json-body";
import { mustMapIntegration } from "@/server/backend/contracts/integrations-mapper";
import type { IntegrationDto } from "@/server/backend/contracts/integrations-dto";
import { isIntegrationKind } from "@/domain/admin/integration";

/**
 * POST /api/admin/integrations/{kind}/toggle — proxy to
 * `POST /api/v1/integrations/{kind}/toggle`. Flips the enabled flag without
 * touching config or secrets. 404 = the kind is not configured.
 */
export async function POST(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    await requireAdminSession();
    const { kind } = await params;
    if (!isIntegrationKind(kind)) {
      throw new BffValidationError([{ field: "kind", message: "Unknown integration kind" }]);
    }
    const body = await readJsonBody<{ enabled?: unknown }>(request);
    if (typeof body.enabled !== "boolean") {
      throw new BffValidationError([{ field: "enabled", message: "enabled must be an explicit boolean" }]);
    }
    const dto = await authenticatedBackendRequest<IntegrationDto>({
      path: `/api/v1/integrations/${kind}/toggle`,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: body.enabled }),
    });
    return NextResponse.json(mustMapIntegration(dto));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
