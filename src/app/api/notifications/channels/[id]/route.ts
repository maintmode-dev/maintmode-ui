import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import type { ChannelDto, UpdateChannelRequestDto } from "@/server/backend/contracts/maintmode-dto";
import { mapNotifyChannel } from "@/server/backend/contracts/notify-channel-mapper";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";
import { isSameOriginRequest } from "@/server/backend/security/csrf";

import { readJsonBody } from "../request-body";

/**
 * GET   /api/notifications/channels/{id} — proxy to `GET /api/v1/notifications/channels/{id}`.
 * PATCH /api/notifications/channels/{id} — proxy to `PATCH /api/v1/notifications/channels/{id}`.
 *
 * PATCH is a partial update of name / description / transport_channel_id only.
 * `transport` is immutable: even if a client sends it, it is never forwarded —
 * switching transports would break existing subscriptions, so the backend
 * ignores it and the UI keeps it read-only.
 */
const MAX_BODY_BYTES = 16 * 1024;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const dto = await authenticatedBackendRequest<ChannelDto>({
      path: `/api/v1/notifications/channels/${encodeURIComponent(id)}`,
      method: "GET",
    });
    return NextResponse.json(mapNotifyChannel(dto));
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

    const parsedBody = await readJsonBody<UpdateChannelRequestDto>(request, MAX_BODY_BYTES);
    if ("error" in parsedBody) return parsedBody.error;
    const parsed = parsedBody.data;

    const body: UpdateChannelRequestDto = {};
    if (typeof parsed.name === "string") body.name = parsed.name.trim();
    if (typeof parsed.description === "string") body.description = parsed.description;
    if (typeof parsed.transport_channel_id === "string") {
      body.transport_channel_id = parsed.transport_channel_id.trim();
    }

    const dto = await authenticatedBackendRequest<ChannelDto>({
      path: `/api/v1/notifications/channels/${encodeURIComponent(id)}`,
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });

    return NextResponse.json(mapNotifyChannel(dto));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
