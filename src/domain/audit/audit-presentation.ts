import type { AuditAction } from "./audit-log";

/**
 * Presentation metadata for each audit action — humanised label and the dot
 * colour token. Colours reuse the status/impact tokens deliberately (per the
 * audit-log snapshot "Action dot colors"): they are semantic signals, not
 * status badges. The `Action` column header + label disambiguate.
 *
 * `user.blocked` reuses `--impact-full-fg` (distinct red from `login.failed`'s
 * `--destructive-fg`). `user.unblocked` is given a neutral-positive green so the
 * row reads as a recovery action. The `maintenance.*` / `maintenance_step.*`
 * lifecycle reuses the same status tokens the calendar/board use so the dot
 * colour matches the maintenance status it records.
 */
const ACTION_META: Record<AuditAction, { label: string; token: string }> = {
  "login.success": { label: "Login success", token: "--status-completed-fg" },
  "login.failed": { label: "Login failed", token: "--destructive-fg" },
  "logout.success": { label: "Logout", token: "--fg-dim" },
  "roles.changed": { label: "Roles changed", token: "--status-planned-fg" },
  "user.blocked": { label: "User blocked", token: "--impact-full-fg" },
  "user.unblocked": { label: "User unblocked", token: "--status-completed-fg" },
  "maintenance.created": { label: "Maintenance created", token: "--status-planned-fg" },
  "maintenance.updated": { label: "Maintenance updated", token: "--status-planned-fg" },
  "maintenance.approved": { label: "Maintenance approved", token: "--status-in_progress-fg" },
  "maintenance.started": { label: "Maintenance started", token: "--status-in_progress-fg" },
  "maintenance.completed": { label: "Maintenance completed", token: "--status-completed-fg" },
  "maintenance.canceled": { label: "Maintenance canceled", token: "--conflict-fg" },
  "maintenance_step.started": { label: "Step started", token: "--status-in_progress-fg" },
  "maintenance_step.completed": { label: "Step completed", token: "--status-completed-fg" },
  "maintenance_step.canceled": { label: "Step canceled", token: "--conflict-fg" },
};

/** Humanised action label, e.g. `login.success` → `Login success`. */
export function auditActionLabel(action: AuditAction): string {
  return ACTION_META[action].label;
}

/** CSS custom-property name for the action's 8px dot colour. */
export function auditActionDotToken(action: AuditAction): string {
  return ACTION_META[action].token;
}

/**
 * Category filter chips for the filter bar (frozen decision 2026-06-10):
 * collapse the per-enum chips into four categories. `All` selects everything;
 * each category covers a group of wire actions. The row dot-colour still
 * distinguishes the specific event inside the table.
 */
export type AuditCategory = "all" | "auth" | "roles" | "block" | "maintenance";

export const AUDIT_CATEGORIES: { id: AuditCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "auth", label: "Auth" },
  { id: "roles", label: "Roles" },
  { id: "block", label: "Block" },
  { id: "maintenance", label: "Maintenance" },
];

const CATEGORY_ACTIONS: Record<Exclude<AuditCategory, "all">, ReadonlySet<AuditAction>> = {
  auth: new Set<AuditAction>(["login.success", "login.failed", "logout.success"]),
  roles: new Set<AuditAction>(["roles.changed"]),
  // `user.unblocked` rides with `user.blocked` — both are user-block lifecycle events.
  block: new Set<AuditAction>(["user.blocked", "user.unblocked"]),
  // Maintenance + step lifecycle.
  maintenance: new Set<AuditAction>([
    "maintenance.created",
    "maintenance.updated",
    "maintenance.approved",
    "maintenance.started",
    "maintenance.completed",
    "maintenance.canceled",
    "maintenance_step.started",
    "maintenance_step.completed",
    "maintenance_step.canceled",
  ]),
};

/** Whether an action belongs to the given category (`all` matches everything). */
export function auditActionInCategory(action: AuditAction, category: AuditCategory): boolean {
  if (category === "all") return true;
  return CATEGORY_ACTIONS[category].has(action);
}

/**
 * Backend `action` filter values for a category — the CSV the server expects
 * (`action=login.success,login.failed,logout.success`). `all` returns an empty
 * list (no filter). Used to translate a category chip into the wire param.
 */
export function auditCategoryActions(category: AuditCategory): AuditAction[] {
  if (category === "all") return [];
  return [...CATEGORY_ACTIONS[category]];
}
