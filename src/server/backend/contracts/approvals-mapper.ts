/**
 * `GET /ui/v1/approvals` → domain {@link ApprovalsPage} (RUK-215).
 *
 * Per rule D-2 every wire→domain translation lives in this layer, so the BFF
 * route stays a thin seam and the browser never sees the wire shapes. Two
 * reconciliations are specific to this endpoint:
 *
 *  - **zero-time** → `undefined` (see {@link isZeroTime});
 *  - **unresolved author** → `undefined` rather than the shared
 *    `mapUserSummary` fallback, so the table can style "no author" instead of
 *    printing a name-shaped string the backend never sent.
 */

import type { ApprovalRow, ApprovalsPage } from "@/domain/maintenance/approval";

import type { ApprovalRowDto, ListApprovalsResponseDto } from "./approvals-dto";
import { mapImpact, mapScope } from "./maintenance-mapper";

/**
 * Is this the Go zero value for `time.Time`?
 *
 * The backend types the queue's `start`/`end` as plain `time.Time`, not
 * pointers, so "no end set" cannot be `null` on the wire — it arrives as
 * `0001-01-01T00:00:00Z`. A comment in the backend claims the UI already reads
 * that as no-end; it does not. `parseDate` in `shared/ui/lib/format` only
 * rejects falsy and NaN, and `new Date("0001-01-01T00:00:00Z")` is a perfectly
 * valid Date — so every formatter would render a real date in the year 1.
 * Catching it here, at the boundary, keeps that from reaching any of them.
 *
 * Matched on the date prefix rather than by parsing: the value is a fixed
 * constant, and a string compare cannot itself trip over timezone conversion.
 */
function isZeroTime(iso: string | undefined | null): boolean {
  return typeof iso === "string" && iso.startsWith("0001-01-01");
}

/** Zero-time and absent both collapse to `undefined`; anything else passes through. */
function optionalTime(iso: string | undefined | null): string | undefined {
  return !iso || isZeroTime(iso) ? undefined : iso;
}

function mapApprovalRow(dto: ApprovalRowDto): ApprovalRow {
  // `start` is required on the domain shape, so a missing or zero one degrades
  // to "" — which the formatters already render as the em-dash placeholder —
  // rather than to a year-1 date.
  const start = optionalTime(dto.start) ?? "";
  const author = dto.created_by?.display_name?.trim();

  return {
    id: dto.id,
    title: dto.title ?? "",
    start,
    end: optionalTime(dto.end),
    scope: mapScope(dto.scope),
    impact: mapImpact(dto.impact),
    // Left undefined when unresolved. Note the backend may itself send the
    // literal "Unknown user" after a partial lookup failure; that is a real
    // value from the wire and passes through untouched.
    created_by: author && author.length > 0 ? author : undefined,
    created_at: optionalTime(dto.created_at) ?? "",
    updated_at: optionalTime(dto.updated_at),
  };
}

/**
 * Projects one page of the queue. Returns the **whole envelope** — unlike
 * `mapCalendarResponse`, which returns a bare array and is wrapped in
 * `{ items }` by its route. Callers must not wrap this one again.
 */
export function mapApprovalsResponse(dto: ListApprovalsResponseDto): ApprovalsPage {
  // The contract promises `[]` for an empty queue, never `null`. Read it
  // defensively anyway: a null here would otherwise throw on `.map` and turn an
  // empty queue into an error state.
  const rows = dto.maintenances ?? [];

  return {
    items: rows.map(mapApprovalRow),
    total: dto.total ?? 0,
    limit: dto.limit ?? 0,
    offset: dto.offset ?? 0,
  };
}
