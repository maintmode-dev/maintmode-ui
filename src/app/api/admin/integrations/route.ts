import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { requireAdminSession } from "@/server/auth/require-admin";
import { routeErrorResponse, BffValidationError } from "@/server/backend/errors/bff-error";
import { isSameOriginRequest } from "@/server/backend/security/csrf";
import { mapIntegrationsList, mustMapIntegration } from "@/server/backend/contracts/integrations-mapper";
import type {
  IntegrationDto,
  ListIntegrationsResponseDto,
} from "@/server/backend/contracts/integrations-dto";
import { readJsonBody } from "@/server/backend/http/read-json-body";
import { isIntegrationKind } from "@/domain/admin/integration";

/**
 * GET /api/admin/integrations — proxy to `GET /api/v1/integrations`
 * (maintmode base, admin-only). Returns `{ integrations: Integration[] }`
 * with the masked domain shape — secret values never exist in this path,
 * only the `secrets_set` is-configured flags.
 */
export async function GET() {
  try {
    await requireAdminSession();
    const dto = await authenticatedBackendRequest<ListIntegrationsResponseDto>({
      path: "/api/v1/integrations",
      method: "GET",
    });
    return NextResponse.json({ integrations: mapIntegrationsList(dto) });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/**
 * POST /api/admin/integrations — proxy to `POST /api/v1/integrations`.
 *
 * Body: `{ kind, enabled, config, secrets }`. `enabled` must be an explicit
 * boolean (the backend rejects an omitted flag — on/off is a deliberate
 * choice); `secrets` values are plaintext and are forwarded verbatim for the
 * backend to encrypt. 409 = the kind is already configured.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    await requireAdminSession();
    const body = await readJsonBody<{
      kind?: string;
      enabled?: unknown;
      config?: unknown;
      secrets?: unknown;
    }>(request);
    if (!body.kind || !isIntegrationKind(body.kind)) {
      throw new BffValidationError([{ field: "kind", message: "Unknown integration kind" }]);
    }
    if (typeof body.enabled !== "boolean") {
      throw new BffValidationError([{ field: "enabled", message: "enabled must be an explicit boolean" }]);
    }
    const dto = await authenticatedBackendRequest<IntegrationDto>({
      path: "/api/v1/integrations",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: body.kind,
        enabled: body.enabled,
        config: body.config ?? {},
        secrets: body.secrets ?? {},
      }),
    });
    return NextResponse.json(mustMapIntegration(dto));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
