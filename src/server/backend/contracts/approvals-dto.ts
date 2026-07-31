/**
 * Wire shapes for `GET /ui/v1/approvals` — the personal "awaiting my approval"
 * queue (backend package `approvalsmodels`, merged in `8a4b4fc`).
 *
 * Deliberately a separate file from `maintmode-dto.ts`: the backend keeps these
 * in their own package so the queue and the calendar contracts can evolve
 * apart, and duplicating `UserSummary` there was an explicit choice rather than
 * an oversight. Mirroring that split here keeps the two from being coupled by
 * our import graph either.
 */

import type { UserSummaryDto } from "./maintmode-dto";

/**
 * `approvalsmodels.ApprovalRow` — a calendar event minus `status` (the listing
 * is drafts by definition, so a one-valued column would be noise), plus the two
 * timestamps the screen reasons about.
 */
export interface ApprovalRowDto {
  id: string;
  title?: string;
  /** ISO-8601 date-time. */
  start?: string;
  /**
   * ISO-8601 date-time. NOT nullable on the wire: the backend field is a plain
   * `time.Time`, so an open-ended period arrives as the Go zero value
   * `0001-01-01T00:00:00Z` rather than as `null`. The mapper is what turns that
   * into `undefined` — see `isZeroTime`.
   */
  end?: string;
  /** `global | resource`. */
  scope?: string;
  /** `none | partial_outage | full_outage`. */
  impact?: string;
  /** `null` when the author could not be resolved (blocked, deleted, lookup failed). */
  created_by?: UserSummaryDto | null;
  created_at?: string;
  /** `null` while the maintenance has not been touched since creation. */
  updated_at?: string | null;
}

/**
 * `approvalsmodels.ListApprovalsResponse`. `limit`/`offset` are echoed back
 * after server-side coercion — malformed pagination is coerced, never rejected,
 * so these can differ from what was requested.
 */
export interface ListApprovalsResponseDto {
  /** Serialized as `[]` for an empty queue, never `null` (read defensively anyway). */
  maintenances?: ApprovalRowDto[] | null;
  total?: number;
  limit?: number;
  offset?: number;
}
