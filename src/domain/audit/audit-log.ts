/**
 * Audit actions per the auth service swagger (`entity.AuditAction`). Dotted
 * lowercase wire values. The set was expanded in RUK-182 with the
 * `maintenance.*` / `maintenance_step.*` lifecycle actions; the former flat
 * snake_case scheme (`login_success`, `assigned`, …) is gone.
 *
 * Exported as a runtime tuple (not just a type) so consumers — and the
 * presentation/exhaustiveness tests — can iterate every action; `AuditAction`
 * is derived from it, keeping the two in lockstep.
 */
export const AUDIT_ACTIONS = [
  "login.success",
  "login.failed",
  "logout.success",
  "roles.changed",
  "user.blocked",
  "user.unblocked",
  "maintenance.created",
  "maintenance.updated",
  "maintenance.approved",
  "maintenance.started",
  "maintenance.completed",
  "maintenance.canceled",
  "maintenance_step.started",
  "maintenance_step.completed",
  "maintenance_step.canceled",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEvent {
  id: string;
  created_at: string;
  /** Actor identifier (email or system id) — backend `actor`. */
  actor?: string;
  /** Resolved human display name of the actor, when the backend has one. */
  actor_display_name?: string;
  actor_id?: string;
  action: AuditAction;
  /** Entity the action targeted — `user` | `maintenance` (backend `entity_type`). */
  entity_type?: string;
  entity_id?: string;
  /** One-line human summary (fallback display). */
  details?: string;
  /** Structured per-action payload backing the expandable detail grid. */
  metadata?: AuditMetadata;
}

/** One before/after field diff (backend `AuditLogFieldChange`). */
export interface AuditFieldChange {
  field?: string;
  old?: string;
  new?: string;
}

/**
 * Structured per-action detail (backend `AuditLogMetadata`). Fields are
 * populated per action: login → ip/user_agent/session_id (+ failure_reason on
 * `login.failed`); logout → session_id/logout_kind; `roles.changed` /
 * `user.blocked` / `user.unblocked` → roles_added/roles_removed/roles +
 * target_display_name/target_email; `maintenance.*` / `maintenance_step.*` →
 * maint_title (+ changes on `maintenance.updated`).
 */
export interface AuditMetadata {
  ip?: string;
  user_agent?: string;
  session_id?: string;
  failure_reason?: string;
  logout_kind?: string;
  roles?: string[];
  roles_added?: string[];
  roles_removed?: string[];
  target_display_name?: string;
  target_email?: string;
  /** Maintenance title snapshot — `maintenance.*` / `maintenance_step.*`. */
  maint_title?: string;
  /** Per-field before/after diff — `maintenance.updated`. */
  changes?: AuditFieldChange[];
}

/** Category facet counts over the current actor/date window. */
export interface AuditFacets {
  all: number;
  auth: number;
  roles: number;
  block: number;
  maintenance: number;
}

/** One server-filtered page of the audit log. */
export interface AuditPage {
  events: AuditEvent[];
  total: number;
  facets: AuditFacets;
}

/**
 * Display handle for an audit actor: resolved display name → actor (email) →
 * "Unknown". Never renders blank. "Unknown" (not "System") is used when the
 * backend omits the actor entirely — we don't pass an unrecorded actor off as
 * the system. A real system actor arrives as an explicit `system@…` value.
 */
export function auditActorHandle(event: Pick<AuditEvent, "actor_display_name" | "actor">): string {
  const name = event.actor_display_name?.trim();
  if (name) return name;
  const actor = event.actor?.trim();
  if (actor) return actor;
  return "Unknown";
}

/**
 * Full actor label for the detail view: `name · email` when both are known,
 * otherwise whichever single value exists, or "Unknown" when neither does (the
 * backend omits the actor on some role events — RUK-174). Avoids a `name · name`
 * echo when the display name already equals the actor string.
 */
export function auditActorFull(event: Pick<AuditEvent, "actor_display_name" | "actor">): string {
  const name = event.actor_display_name?.trim();
  const email = event.actor?.trim();
  if (name && email && name !== email) return `${name} · ${email}`;
  return name || email || "Unknown";
}
