import { NextResponse } from "next/server";

import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import type { ListApprovalsResponseDto } from "@/server/backend/contracts/approvals-dto";
import { mapApprovalsResponse } from "@/server/backend/contracts/approvals-mapper";
import { routeErrorResponse } from "@/server/backend/errors/bff-error";

/**
 * GET /api/approvals — proxy to backend `GET /ui/v1/approvals` (RUK-215).
 *
 * The personal "awaiting my approval" queue. There is no parameter for whose
 * queue to fetch: the backend takes the approver from the access token, so this
 * route cannot be made to return someone else's work.
 *
 * The backend gates the route on the same authz scenario as the approve action
 * itself, so reviewer and admin reach it while editor and guest get a 403 —
 * which `routeErrorResponse` passes through in the standard envelope for the
 * page to render.
 *
 * Answers `approvalsmodels.ListApprovalsResponse`, which `mapApprovalsResponse`
 * projects into `{ items, total, limit, offset }`. Note it returns the WHOLE
 * envelope — unlike `mapCalendarResponse`, which returns a bare array and is
 * wrapped in `{ items }` by its route. Wrapping this one again would nest it.
 */

/**
 * Page size is ours to set, not the caller's. The backend defaults to 50 and
 * silently coerces anything above 200 back down to 50, so there is no value in
 * letting a client ask — and no `limit` in the query string keeps the cache key
 * (`["approvals", limit, offset]`) honest about what was actually requested.
 */
const PAGE_SIZE = 50;

/**
 * Upper bound on `offset`. A digits-only check alone would accept a 400-digit
 * number and forward it into the backend's query string; the queue is a
 * personal review list, so anything past this is a malformed request, not a
 * real page. Out-of-range falls back to the first page rather than erroring —
 * matching the backend, which coerces bad pagination instead of rejecting it.
 */
const MAX_OFFSET = 100_000;
const DIGITS = /^\d+$/;

function readOffset(raw: string | null): number {
  if (!raw || !DIGITS.test(raw)) return 0;
  const offset = Number(raw);
  return Number.isSafeInteger(offset) && offset <= MAX_OFFSET ? offset : 0;
}

export async function GET(request: Request) {
  try {
    const offset = readOffset(new URL(request.url).searchParams.get("offset"));

    const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    const dto = await authenticatedBackendRequest<ListApprovalsResponseDto>({
      path: `/ui/v1/approvals?${query.toString()}`,
      method: "GET",
    });

    return NextResponse.json(mapApprovalsResponse(dto));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
