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
  /** Display name of the acting user (backend `actor`), when present. */
  actor?: string;
  action: AuditAction;
  /** Entity the action targeted, e.g. "user" (backend `entity_type`/`target_type`). */
  entity_type?: string;
  entity_id?: string;
  target_type?: string;
  target_id?: string;
  /** Free-text detail string (backend `details` is a string, not an object). */
  details?: string;
}
