export type AuditAction =
  | "maintenance.created"
  | "maintenance.edited"
  | "maintenance.approved"
  | "maintenance.started"
  | "maintenance.completed"
  | "maintenance.canceled"
  | "step.started"
  | "step.completed"
  | "step.skipped"
  | "resource.created"
  | "resource.archived"
  | "resource.edited"
  | "user.invited"
  | "user.invite_revoked"
  | "user.invite_accepted"
  | "user.blocked"
  | "user.unblocked"
  | "user.role_assigned"
  | "user.role_revoked"
  | "auth.login"
  | "auth.logout";

export interface AuditEvent {
  id: string;
  created_at: string;
  actor: string;
  action: AuditAction;
  target_type: string;
  target_id?: string;
  /** Human-readable summary for the table cell. */
  summary?: string;
  /** Expandable JSON diff payload. */
  details?: Record<string, unknown>;
}
