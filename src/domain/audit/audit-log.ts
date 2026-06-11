/**
 * Audit actions per the auth service swagger. Flat snake_case wire values —
 * the previous dotted `maintenance.*`/`resource.*`/`user.*` scheme was an
 * invented FE shape and is gone.
 */
export type AuditAction =
  | "login_success"
  | "login_failed"
  | "logout_success"
  | "assigned"
  | "revoked"
  | "replaced"
  | "blocked"
  | "unblocked";

export interface AuditEvent {
  id: string;
  created_at: string;
  /** Actor identifier (email or system id) — backend `actor`. */
  actor?: string;
  /** Resolved human display name of the actor, when the backend has one. */
  actor_display_name?: string;
  actor_id?: string;
  action: AuditAction;
  /** Entity the action targeted, e.g. "user" (backend `entity_type`/`target_type`). */
  entity_type?: string;
  entity_id?: string;
  target_type?: string;
  target_id?: string;
  /** One-line human summary (fallback display). */
  details?: string;
  /** Structured per-action payload backing the expandable detail grid. */
  metadata?: AuditMetadata;
}

/**
 * Structured per-action detail (backend `AuditLogMetadata`). Fields are
 * populated per action: login → ip/user_agent/session_id (+ failure_reason on
 * `login_failed`); logout → session_id/logout_kind; role events →
 * roles_added/roles_removed/roles + target_display_name/target_email.
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
}

/** Category facet counts over the current actor/date window. */
export interface AuditFacets {
  all: number;
  auth: number;
  roles: number;
  block: number;
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
