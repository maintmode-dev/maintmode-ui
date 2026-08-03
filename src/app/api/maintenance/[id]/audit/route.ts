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
 * Consequence (until the backend ships a real per-maintenance audit endpoint):
 * the match runs against a single global page, so we request the largest page the auth
 * service allows (`limit=100`) to maximize coverage and we DROP the caller's
 * `limit`/`offset` — paginating a post-filtered subset against an unfiltered,
 * globally-paginated source would silently skip matching rows. Pass-through is
 * limited to the filters that compose correctly with this approach (action,
 * actor, created_at range). A maintenance with audit rows older than the newest
 * 100 global entries can still be under-reported; that's a backend-contract
 * limitation, not something the BFF can paper over.
 *
 * The envelope also carries `{ reference, title }` so the audit page can head
 * itself without a second round-trip for `GET /api/maintenance/{id}`. Both are
 * derived from the events we already hold — no extra backend call:
 *  - title     : `metadata.maint_title`, the title snapshot the auth service
 *                writes on every `maintenance.*` / `maintenance_step.*` row.
 *                Read newest-first so a renamed maintenance heads with its
 *                current name rather than the one it was created under.
 *  - reference : always `undefined` today. The audit rows carry no MNT-id, and
 *                neither does the maintenance read view (`mapMaintenanceView`
 *                never sets `reference`), so the detail fetch this replaced
 *                could not populate it either — the page's existing
 *                no-reference fallback was the only live behaviour. It stays in
 *                the envelope as the single place to fill in once the backend
 *                emits one.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ events: [], reference: undefined, title: undefined });
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

    // Newest-first feed, so the first row carrying a snapshot holds the most
    // recent title. `undefined` when no row does (the page falls back to the id).
    const title = events.find((event) => event.metadata?.maint_title)?.metadata?.maint_title;

    return NextResponse.json({ events, reference: undefined, title });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
