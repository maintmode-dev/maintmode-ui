import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import type {
  CreateResourceRequestDto,
  ListResourcesResponseDto,
  ResourceDto,
} from "@/server/backend/contracts/maintmode-dto";
import { mapResource, mapResourceList } from "@/server/backend/contracts/resource-mapper";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { isSameOriginRequest } from "@/server/backend/security/csrf";

import { readJsonBody } from "./request-body";

/**
 * GET  /api/resources — proxy to backend `GET /api/v1/resources/list`.
 * POST /api/resources — proxy to backend `POST /api/v1/resource/create`.
 *
 * List query params (sanitized before forwarding):
 *  - `name`     : optional name filter (server-side contains match).
 *  - `limit`    : clamped to [1, 200], default 50.
 *  - `offset`   : clamped to >= 0, default 0.
 *  - `archived` : `true` returns only archived resources, anything else
 *                 (default) returns only active ones.
 *
 * The list answers with `apimodels.ListResourcesResponse`, which the
 * `mapResourceList` adapter projects into `{ resources, limit, offset, total }`
 * the UI paginates against (EC-2: `total` may exceed the page length).
 */
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;
const MAX_BODY_BYTES = 16 * 1024;

function clampLimit(raw: string | null): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(value)));
}

function clampOffset(raw: string | null): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const backendQuery = new URLSearchParams();

    const name = url.searchParams.get("name");
    if (name) backendQuery.set("name", name);
    backendQuery.set("limit", String(clampLimit(url.searchParams.get("limit"))));
    backendQuery.set("offset", String(clampOffset(url.searchParams.get("offset"))));
    backendQuery.set("archived", url.searchParams.get("archived") === "true" ? "true" : "false");

    const dto = await authenticatedBackendRequest<ListResourcesResponseDto>({
      path: `/api/v1/resources/list?${backendQuery.toString()}`,
      method: "GET",
    });

    return NextResponse.json(mapResourceList(dto));
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  try {
    const parsedBody = await readJsonBody<CreateResourceRequestDto>(request, MAX_BODY_BYTES);
    if ("error" in parsedBody) return parsedBody.error;
    const parsed = parsedBody.data;

    const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
    if (!name) {
      return NextResponse.json(
        { error: "Resource name is required", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const body: CreateResourceRequestDto = { name };
    if (typeof parsed.description === "string") body.description = parsed.description;
    if (typeof parsed.external_id === "string") body.external_id = parsed.external_id;

    const dto = await authenticatedBackendRequest<ResourceDto>({
      path: "/api/v1/resource/create",
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });

    return NextResponse.json(mapResource(dto));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
