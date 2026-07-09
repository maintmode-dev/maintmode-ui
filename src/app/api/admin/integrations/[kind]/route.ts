import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { requireAdminSession } from "@/server/auth/require-admin";
import { routeErrorResponse, BffValidationError } from "@/server/backend/errors/bff-error";
import { isSameOriginRequest } from "@/server/backend/security/csrf";
import { readJsonBody } from "@/server/backend/http/read-json-body";
import { mustMapIntegration } from "@/server/backend/contracts/integrations-mapper";
import type { IntegrationDto } from "@/server/backend/contracts/integrations-dto";
import { isIntegrationKind, type IntegrationKind } from "@/domain/admin/integration";

/** Resolve and whitelist the `[kind]` path segment before touching the backend. */
async function resolveKind(params: Promise<{ kind: string }>): Promise<IntegrationKind> {
  const { kind } = await params;
  if (!isIntegrationKind(kind)) {
    throw new BffValidationError([{ field: "kind", message: "Unknown integration kind" }]);
  }
  return kind;
}

/**
 * GET /api/admin/integrations/{kind} — proxy to `GET /api/v1/integrations/{kind}`.
 * 404 = the kind is not configured yet.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  try {
    await requireAdminSession();
    const kind = await resolveKind(params);
    const dto = await authenticatedBackendRequest<IntegrationDto>({
      path: `/api/v1/integrations/${kind}`,
      method: "GET",
    });
    return NextResponse.json(mustMapIntegration(dto));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/**
 * PATCH /api/admin/integrations/{kind} — proxy to `PATCH /api/v1/integrations/{kind}`.
 *
 * Uniform PATCH semantics (mirrors `apimodels.UpdateIntegrationRequest`):
 * every omitted field keeps its stored value, so fields are forwarded only
 * when present — defaulting an omitted `config` to `{}` would silently wipe
 * the stored config (an explicit object replaces it wholesale). `secrets`
 * carries per-key intents verbatim: key absent → keep, non-empty string →
 * replace, `null` → clear. Untouched secrets never appear in the payload.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    await requireAdminSession();
    const kind = await resolveKind(params);
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
      path: `/api/v1/integrations/${kind}`,
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    return NextResponse.json(mustMapIntegration(dto));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
