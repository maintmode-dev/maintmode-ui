import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import type { ResourceDto, UpdateResourceRequestDto } from "@/server/backend/contracts/maintmode-dto";
import { mapResource } from "@/server/backend/contracts/resource-mapper";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { isSameOriginRequest } from "@/server/backend/security/csrf";

import { readJsonBody } from "../request-body";

/**
 * GET   /api/resources/{id} — proxy to backend `GET /api/v1/resource/{id}`.
 * PATCH /api/resources/{id} — proxy to backend `PATCH /api/v1/resource/{id}`.
 *
 * PATCH is a partial update: only the fields present in the body are forwarded.
 * `external_id: ""` is preserved (not dropped) because the backend treats an
 * empty string as an explicit "clear this field" instruction.
 */
const MAX_BODY_BYTES = 16 * 1024;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const dto = await authenticatedBackendRequest<ResourceDto>({
      path: `/api/v1/resource/${encodeURIComponent(id)}`,
      method: "GET",
    });
    return NextResponse.json(mapResource(dto));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    const { id } = await params;

    const parsedBody = await readJsonBody<UpdateResourceRequestDto>(request, MAX_BODY_BYTES);
    if ("error" in parsedBody) return parsedBody.error;
    const parsed = parsedBody.data;

    const body: UpdateResourceRequestDto = {};
    if (typeof parsed.name === "string") body.name = parsed.name.trim();
    if (typeof parsed.description === "string") body.description = parsed.description;
    // Forward external_id even when empty: "" is the backend's clear signal.
    if (typeof parsed.external_id === "string") body.external_id = parsed.external_id;

    const dto = await authenticatedBackendRequest<ResourceDto>({
      path: `/api/v1/resource/${encodeURIComponent(id)}`,
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });

    return NextResponse.json(mapResource(dto));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
