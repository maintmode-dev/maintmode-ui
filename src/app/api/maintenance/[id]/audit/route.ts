import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { mapAuditLogResponse } from "@/server/backend/contracts/audit-mapper";
import type { AuditLogResponseDto } from "@/server/backend/contracts/maintmode-dto";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";

/** Query params the auth `/api/v1/audit/log` endpoint actually understands. */
const FORWARDED_PARAMS = ["action", "actor", "created_from", "created_to"] as const;

/** Hard cap the auth endpoint enforces on `limit` (swagger: "max 100"). */
const MAX_AUTH_LOG_LIMIT = 100;

/**
 * GET /api/maintenance/{id}/audit — per-maintenance slice of the auth-service
 * audit log (`GET /api/v1/audit/log`, auth base).
 *
 * The auth endpoint has NO `entity_id` filter — it only supports action/actor/
 * created_at-range filters plus offset/limit pagination over the *global* log.
 * So per-maintenance scoping has to happen here: we fetch a page of the global
 * log and keep the rows whose `entity_id` matches (entity_type `maintenance`).
 *
 * Consequence (until RUK-42 ships a real per-maintenance endpoint): the match
 * runs against a single global page, so we request the largest page the auth
 * service allows (`limit=100`) to maximize coverage and we DROP the caller's
 * `limit`/`offset` — paginating a post-filtered subset against an unfiltered,
 * globally-paginated source would silently skip matching rows. Pass-through is
 * limited to the filters that compose correctly with this approach (action,
 * actor, created_at range). A maintenance with audit rows older than the newest
 * 100 global entries can still be under-reported; that's a backend-contract
 * limitation, not something the BFF can paper over.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ events: [] });
    }

    const incoming = new URL(request.url).searchParams;
    const forwarded = new URLSearchParams();
    for (const key of FORWARDED_PARAMS) {
      const value = incoming.get(key);
      if (value !== null) forwarded.set(key, value);
    }
    // Always request the max page; see the limit/offset note above.
    forwarded.set("limit", String(MAX_AUTH_LOG_LIMIT));

    const dto = await authenticatedBackendRequest<AuditLogResponseDto>({
      path: `/api/v1/audit/log?${forwarded.toString()}`,
      method: "GET",
      useAuthBase: true,
    });

    const events = mapAuditLogResponse(dto).events.filter((event) => event.entity_id === id);

    return NextResponse.json({ events });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
