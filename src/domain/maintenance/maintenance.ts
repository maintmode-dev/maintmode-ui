/**
 * Domain models for maintenance windows, derived from the backend
 * swagger contract (`apimodels.Maintenance` + neighbours). These types
 * are deliberately simplified — fields the UI doesn't read are dropped;
 * enum unions live in TypeScript instead of strings-for-strings-sake.
 *
 * When phase 5 wires real BFF data, the corresponding contract types in
 * `src/server/backend/contracts/` will map onto these via adapters; the
 * UI doesn't have to know about the underlying swagger spelling.
 */

export type MaintenanceStatus = "draft" | "planned" | "in_progress" | "completed" | "canceled";

export type MaintenanceImpact = "none" | "partial_outage" | "full_outage";

export type MaintenanceScope = "internal" | "external" | "public";

export type CancelReason = "conflict" | "incident" | "business_decision" | "rescheduled" | "mistake";

export interface Period {
  start: string;
  end: string;
}

export interface MaintenanceResource {
  id: string;
  name: string;
  /** Snapshot calls this `database | cluster | service`; backend keeps it free-text. */
  type?: string;
}

export type StepStatus = "pending" | "in_progress" | "done" | "skipped";

export interface MaintenanceStep {
  id: string;
  title: string;
  description?: string;
  /** ISO duration string (e.g. "PT5M") OR human "5m" — UI normalizes for display. */
  duration?: string;
  status: StepStatus;
  started_at?: string;
  completed_at?: string;
}

/**
 * Actions the current user may take on this maintenance. Backend computes
 * these from role × status × can_admin; UI MUST consume the flags
 * directly (frozen decision: no client-side recomputation).
 */
export interface MaintenanceActions {
  can_edit: boolean;
  can_cancel: boolean;
  can_approve: boolean;
  can_start: boolean;
  can_complete: boolean;
}

export interface Conflict {
  maintenance_id: string;
  /** Display reference, e.g. "MNT-1042". */
  reference?: string;
  title: string;
  /** Overlap window. */
  overlap_start: string;
  overlap_end: string;
  /** Resolved when the conflicting maintenance is canceled or moved out of the window. */
  resolved?: boolean;
}

export interface Maintenance {
  id: string;
  reference?: string;
  title: string;
  description?: string;
  status: MaintenanceStatus;
  impact: MaintenanceImpact;
  scope: MaintenanceScope;
  planned_period: Period;
  actual_period?: Period;
  resources: MaintenanceResource[];
  steps: MaintenanceStep[];
  /** Set when status=canceled. */
  cancel_reason?: CancelReason;
  cancel_reason_comment?: string;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceDetail extends Maintenance {
  actions: MaintenanceActions;
  conflicts: Conflict[];
  /** Snapshot fingerprint for optimistic-concurrency on approve/edit. */
  snapshot_id?: string;
}
