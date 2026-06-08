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
 * The list takes a single `archived` flag (UI vocabulary) and forwards it as the
 * backend's `include_archived`: `true` widens the catalog to include archived
 * channels, anything else (default) returns active ones only. The response is a
 * plain `{ channels }` envelope (no pagination window), projected to the domain
 * `NotifyChannel[]` the list screen renders.
 */
const MAX_BODY_BYTES = 16 * 1024;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const backendQuery = new URLSearchParams();
    // The catalog endpoint hides archived channels unless include_archived=true.
    if (url.searchParams.get("archived") === "true") {
      backendQuery.set("include_archived", "true");
    }

    const query = backendQuery.toString();
    const dto = await authenticatedBackendRequest<ChannelsResponseDto>({
      path: `/api/v1/notifications/channels${query ? `?${query}` : ""}`,
      method: "GET",
    });

    return NextResponse.json({ channels: mapNotifyChannelList(dto) });
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
