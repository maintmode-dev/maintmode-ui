/**
 * Domain model for the "awaiting my approval" queue (RUK-215).
 *
 * Deliberately NOT a reuse of {@link Maintenance}. The queue response carries no
 * `status`, `resources`, `steps`, or `notify_targets`, so mapping it onto the
 * fuller shape would mean filling those with empty defaults and inventing a
 * status the wire never sent. `mapCalendarResponse` already pays that price —
 * it stuffs `resources: []`, `steps: []` and sets `created_at` to the window
 * start, which is simply untrue. One such compromise in the codebase is enough.
 */

import type { MaintenanceImpact, MaintenanceScope } from "./maintenance";

export interface ApprovalRow {
  id: string;
  title: string;
  /** Window start, ISO-8601. */
  start: string;
  /**
   * Window end, ISO-8601 — `undefined` for an open-ended period.
   *
   * The backend cannot express "no end" as `null` (the field is a plain
   * `time.Time`), so it sends the Go zero value `0001-01-01T00:00:00Z`. The
   * mapper normalizes that to `undefined` here, because every date formatter in
   * this codebase would otherwise render it as a real date in the year 1.
   */
  end?: string;
  scope: MaintenanceScope;
  impact: MaintenanceImpact;
  /**
   * Author display name. `undefined` when the backend could not resolve the
   * author at all; note it may also arrive as the literal "Unknown user" from a
   * partial resolution failure — both mean "no name to show", and neither is a
   * reason to hide the row.
   */
  created_by?: string;
  created_at: string;
  /** `undefined` while the maintenance has not been touched since creation. */
  updated_at?: string;
}

/** One page of the queue, as the BFF hands it to the browser. */
export interface ApprovalsPage {
  items: ApprovalRow[];
  total: number;
  /** Echoed back after server-side coercion — may differ from what was asked. */
  limit: number;
  offset: number;
}
