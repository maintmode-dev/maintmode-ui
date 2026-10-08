/**
 * Audit actions per the auth service swagger (`entity.AuditAction`). Dotted
 * lowercase wire values. The set includes the `maintenance.*` /
 * `maintenance_step.*` lifecycle actions; the former flat snake_case scheme
 * (`login_success`, `assigned`, …) is gone.
 *
 * Exported as a runtime tuple (not just a type) so consumers — and the
 * presentation/exhaustiveness tests — can iterate every action; `AuditAction`
 * is derived from it, keeping the two in lockstep.
 *
 * Kept equal to the backend's published enum by
 * `tests/contracts/audit-actions.contract.test.ts`, which compares this tuple
 * with the vendored `entity.AuditAction` schema
 * (`tests/fixtures/wire/audit-action-enum.json`). It is still a hand-written
 * list — the label and colour of each member are a UI decision — but it can no
 * longer fall behind silently: that is how five actions went missing (RUK-297).
 */
export const AUDIT_ACTIONS = [
  "login.success",
  "login.failed",
  "logout.success",
  "password.changed",
  "password.reset",
  "provider.linked",
  "auth_method.toggled",
  "roles.changed",
  "user.tags_changed",
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
  // Written by `/admin/integrations`. Until these were here the route dropped
  // every one of them (docs/contract-gaps.md, RUK-297): the record of who
  // re-pointed a stored token's destination never reached the screen.
  "integration.created",
  "integration.updated",
  "integration.deleted",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * The action an audit row actually carries: one of the modelled
 * {@link AuditAction}s, or a wire value this build has not heard of.
 *
 * An unknown action is a real record and is SHOWN — as a neutral row labelled
 * with the raw value — rather than dropped. A security log that silently shows
 * less than happened is worse than one that shows a row plainly (RUK-297). The
 * `string & {}` arm keeps the known literals visible to the editor without
 * pretending every string is one of them; narrow with
 * {@link isKnownAuditAction} before treating a value as modelled.
 */
export type AuditEventAction = AuditAction | (string & {});

const KNOWN_AUDIT_ACTIONS: ReadonlySet<string> = new Set<string>(AUDIT_ACTIONS);

/** Whether a wire action is one this build models (label, colour, category). */
export function isKnownAuditAction(action: string): action is AuditAction {
  return KNOWN_AUDIT_ACTIONS.has(action);
}

export interface AuditEvent {
  id: string;
  created_at: string;
  /** Actor identifier (email or system id) — backend `actor`. */
  actor?: string;
  /** Resolved human display name of the actor, when the backend has one. */
  actor_display_name?: string;
  actor_id?: string;
  /** Wire action — possibly one the UI does not model; see {@link AuditEventAction}. */
  action: AuditEventAction;
  /** Entity the action targeted — `user` | `maintenance` | `integration` | `auth_setting` (backend `entity_type`). */
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
 * maint_title (+ changes on `maintenance.updated`); `integration.updated` →
 * changes (config fields, `enabled`, and `secrets.<key>` flags);
 * `password.changed` / `password.reset` / `provider.linked` → ip/user_agent
 * (+ failure_reason on a refused link); `user.tags_changed` → changes +
 * target_display_name/target_email.
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
  /**
   * Per-field before/after diff — `maintenance.updated`, `integration.updated`,
   * `user.tags_changed`.
   * A `secrets.<key>` entry has neither side: it says the secret was replaced
   * or cleared, and its value is never recorded.
   */
  changes?: AuditFieldChange[];
}

/** Category facet counts over the current actor/date window. */
export interface AuditFacets {
  all: number;
  auth: number;
  roles: number;
  block: number;
  maintenance: number;
  integration: number;
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
 * backend omits the actor on some role events). Avoids a `name · name`
 * echo when the display name already equals the actor string.
 */
export function auditActorFull(event: Pick<AuditEvent, "actor_display_name" | "actor">): string {
  const name = event.actor_display_name?.trim();
  const email = event.actor?.trim();
  if (name && email && name !== email) return `${name} · ${email}`;
  return name || email || "Unknown";
}
