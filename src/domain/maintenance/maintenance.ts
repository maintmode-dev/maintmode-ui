/**
 * Domain models for maintenance windows, derived from the backend
 * swagger contract (`apimodels.Maintenance` + neighbours). These types
 * are deliberately simplified — fields the UI doesn't read are dropped;
 * enum unions live in TypeScript instead of strings-for-strings-sake.
 *
 * The corresponding contract (swagger) types live in
 * `src/server/backend/contracts/`; mappers there translate the backend
 * spelling onto these domain shapes so the UI never sees the wire format.
 */

export type MaintenanceStatus = "draft" | "planned" | "in_progress" | "completed" | "canceled";

export type MaintenanceImpact = "none" | "partial_outage" | "full_outage";

/** Wire values per swagger `apimodels.MaintenanceScope`. */
export type MaintenanceScope = "global" | "resource";

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

/**
 * A notify target as it would surface on the read path — the channel the
 * maintenance broadcasts to. The write contract already carries
 * `notify_target_channel_ids`; the read view does not expose `notify_targets`
 * yet (backend gap), so `Maintenance.notify_targets` is currently always empty.
 * The mapper reads it defensively so the Notify-channels section lights up the
 * moment the backend starts returning it — no further UI change needed.
 */
export interface MaintenanceNotifyTarget {
  id: string;
  /** Human channel name, e.g. "#incidents-eu". */
  name: string;
  /** Transport glyph driver: `slack | telegram | email | …` (open string). */
  transport?: string;
}

export type StepStatus = "pending" | "in_progress" | "done" | "skipped";

export interface MaintenanceStep {
  id: string;
  /** Display label. Mapped from backend `description` (swagger has no `title`). */
  title: string;
  description?: string;
  /** 1-based position from backend `order`, when present. */
  order?: number;
  /** ISO duration string (e.g. "PT5M") OR human "5m" — UI normalizes for display. */
  duration?: string;
  /** Backend rollback plan for the step, when present. */
  rollback_description?: string;
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
  /**
   * Notify channels the maintenance broadcasts to. Read-only on this shape.
   * Empty until the backend adds `notify_targets` to the read view (see
   * {@link MaintenanceNotifyTarget}).
   */
  notify_targets: MaintenanceNotifyTarget[];
  steps: MaintenanceStep[];
  /** Set when status=canceled. */
  cancel_reason?: CancelReason;
  cancel_reason_comment?: string;
  /** Author display name (backend `created_by.display_name`, may be "Unknown user"). */
  created_by?: string;
  /** Approver display name (backend `approver.display_name`), set once approved. */
  approver?: string;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceDetail extends Maintenance {
  actions: MaintenanceActions;
  conflicts: Conflict[];
  /**
   * Integer optimistic-concurrency revision (backend `revision`). Sent back
   * as `observed_maint_revision` on approve.
   */
  revision?: number;
}

/**
 * A single step as the create/edit form submits it. Distinct from the read
 * `MaintenanceStep`: no `id`/`status` (assigned by the backend), and
 * `duration` is the human Go-duration string (e.g. "1h30m") the write
 * contract expects.
 */
export interface MaintenanceStepInput {
  /** 1-based position. */
  order: number;
  description: string;
  /** Go-duration string, e.g. "1h30m". Empty/undefined when unset. */
  duration?: string;
  rollback_description?: string;
}

/**
 * Form payload for creating a draft and editing an existing one (both hit the
 * same backend shape — `CreateDraftMaintRequest` / `UpdateDraftMaintRequest`).
 * The BFF mapper translates this onto the wire contract.
 */
export interface MaintenanceDraftInput {
  title: string;
  description?: string;
  /** ISO-8601 datetime of the planned start. */
  planned_start: string;
  scope: MaintenanceScope;
  impact: MaintenanceImpact;
  /** Resource ids in scope (empty for `global`). */
  resource_ids: string[];
  steps: MaintenanceStepInput[];
  /** Chosen approver (backend `approver_user_id`), when picked. */
  approver_user_id?: string;
  /**
   * Notification channel ids the maintenance broadcasts to. Required by the
   * backend (`notify_targets: { channel_ids }`, min 1) — a blank list is
   * rejected with `notify_targets: cannot be blank` on BOTH create and edit.
   * Channel ids come from the catalog (`@/domain/notify-channel`, RUK-164).
   */
  notify_target_channel_ids: string[];
}

/**
 * A user eligible to be picked as approver. Backend
 * `uimodels.AssignableUser` (`GET /api/v1/users/assignable`).
 */
export interface AssignableUser {
  id: string;
  display_name: string;
  email: string;
  roles: string[];
}

/**
 * A cancel reason as the backend exposes it (`GET
 * /api/v1/maintenances/cancel-reasons`): the enum `value` plus display text.
 * The hardcoded fallback in the cancel dialog mirrors this shape.
 */
export interface MaintenanceCancelReason {
  value: CancelReason;
  title: string;
  description?: string;
}
