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
 * GET /api/admin/integrations/{kind}/{name} — proxy to
 * `GET /api/v1/integrations/{kind}/{name}`. 404 = the pair is not configured yet.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; name: string }> }) {
  try {
    await requireAdminSession();
    const { kind, name } = await resolveIntegrationParams(params);
    const dto = await authenticatedBackendRequest<IntegrationDto>({
      path: `/api/v1/integrations/${kind}/${name}`,
      method: "GET",
    });
    return NextResponse.json(mustMapIntegration(dto));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/**
 * PATCH /api/admin/integrations/{kind}/{name} — proxy to
 * `PATCH /api/v1/integrations/{kind}/{name}`.
 *
 * Uniform PATCH semantics (mirrors `apimodels.UpdateIntegrationRequest`):
 * every omitted field keeps its stored value, so fields are forwarded only
 * when present — defaulting an omitted `config` to `{}` would silently wipe
 * the stored config (an explicit object replaces it wholesale). `secrets`
 * carries per-key intents verbatim: key absent → keep, non-empty string →
 * replace, `null` → clear. Untouched secrets never appear in the payload.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ kind: string; name: string }> }) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    await requireAdminSession();
    const { kind, name } = await resolveIntegrationParams(params);
    const body = await readJsonBody<{
      enabled?: unknown;
      config?: unknown;
      secrets?: unknown;
    }>(request);
    if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
      throw new BffValidationError([{ field: "enabled", message: "enabled must be a boolean when present" }]);
    }
    const patch: Record<string, unknown> = {};
    if (body.enabled !== undefined) patch.enabled = body.enabled;
    if (body.config !== undefined) patch.config = body.config;
    if (body.secrets !== undefined) patch.secrets = body.secrets;
    const dto = await authenticatedBackendRequest<IntegrationDto>({
      path: `/api/v1/integrations/${kind}/${name}`,
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    return NextResponse.json(mustMapIntegration(dto));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
