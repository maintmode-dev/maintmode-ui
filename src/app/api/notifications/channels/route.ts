import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import type {
  ChannelDto,
  ChannelsResponseDto,
  CreateChannelRequestDto,
} from "@/server/backend/contracts/maintmode-dto";
import { mapNotifyChannel, mapNotifyChannelList } from "@/server/backend/contracts/notify-channel-mapper";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { isSameOriginRequest } from "@/server/backend/security/csrf";

import { readJsonBody } from "./request-body";

/**
 * GET  /api/notifications/channels — proxy to `GET /api/v1/notifications/channels`.
 * POST /api/notifications/channels — proxy to `POST /api/v1/notifications/channels`.
 *
 * List query params (sanitized before forwarding):
 *  - `name`     : optional name filter. Server-side contains match, case
 *                 insensitive, against the channel NAME only — not the
 *                 transport, not `transport_channel_id`, not the description.
 *  - `limit`    : clamped to [1, 200], default 50.
 *  - `offset`   : clamped to >= 0, default 0.
 *  - `archived` : `true` WIDENS the catalog to include archived channels
 *                 (backend `include_archived`), unlike the resources route where
 *                 `archived=true` returns archived ones EXCLUSIVELY. Same word,
 *                 opposite meaning — do not "align" the two.
 *
 * The list answers `{ channels, limit, offset, total }`, which `mapNotifyChannelList`
 * projects for the UI to paginate against. `total` is the count the query
 * matched, so under `name` it is the number of matches, not the catalog size.
 *
 * The clamps are load-bearing, not hygiene. Measured against the backend:
 * `limit=201` does not clamp to 200, it RESETS TO 50 — asking for more than the
 * maximum silently returns less than a valid request would. And an unknown
 * parameter name comes back 200 with an unfiltered list, so a typo here fails
 * silently rather than loudly (RUK-274).
 */
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;
const MAX_BODY_BYTES = 16 * 1024;

/**
 * Deliberately NOT a copy of the resources route's twin, which returns 1 — not
 * `DEFAULT_LIMIT` — for absent, empty and non-positive input: `Number(null)` and
 * `Number("")` are 0, which is finite, so they slip past the `isFinite` guard
 * into `Math.max(1, 0)`. Resources gets away with it because both of its callers
 * always pass `limit`; a caller here that omits it would be served a ONE-ROW
 * page. Anything not a positive number falls back to the default.
 */
function clampLimit(raw: string | null): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(value)));
}

/** Copied verbatim from the resources route — this one has no such flaw. */
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
    // The catalog endpoint hides archived channels unless include_archived=true.
    if (url.searchParams.get("archived") === "true") {
      backendQuery.set("include_archived", "true");
    }

    const dto = await authenticatedBackendRequest<ChannelsResponseDto>({
      path: `/api/v1/notifications/channels?${backendQuery.toString()}`,
      method: "GET",
    });

    return NextResponse.json(mapNotifyChannelList(dto));
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
    const parsedBody = await readJsonBody<CreateChannelRequestDto>(request, MAX_BODY_BYTES);
    if ("error" in parsedBody) return parsedBody.error;
    const parsed = parsedBody.data;

    const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
    const transport = typeof parsed.transport === "string" ? parsed.transport.trim() : "";
    const transportChannelId =
      typeof parsed.transport_channel_id === "string" ? parsed.transport_channel_id.trim() : "";

    if (!name || !transport || !transportChannelId) {
      return NextResponse.json(
        { error: "Name, transport, and channel ID are required", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const body: CreateChannelRequestDto = {
      name,
      transport,
      transport_channel_id: transportChannelId,
    };
    if (typeof parsed.description === "string") body.description = parsed.description;

    const dto = await authenticatedBackendRequest<ChannelDto>({
      path: "/api/v1/notifications/channels",
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });

    return NextResponse.json(mapNotifyChannel(dto), { status: 201 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
