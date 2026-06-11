import type { AuditAction } from "./audit-log";

/**
 * Presentation metadata for each audit action — humanised label and the dot
 * colour token. Colours reuse the status/impact tokens deliberately (per the
 * audit-log snapshot "Action dot colors"): they are semantic signals, not
 * status badges. The `Action` column header + label disambiguate.
 *
 * `blocked` reuses `--impact-full-fg` (distinct red from `login_failed`'s
 * `--destructive-fg`). `unblocked` is not in the frozen table but exists on the
 * wire — given a neutral-positive green so the row reads as a recovery action.
 */
const ACTION_META: Record<AuditAction, { label: string; token: string }> = {
  login_success: { label: "Login success", token: "--status-completed-fg" },
  login_failed: { label: "Login failed", token: "--destructive-fg" },
  logout_success: { label: "Logout", token: "--fg-dim" },
  assigned: { label: "Role assigned", token: "--status-planned-fg" },
  revoked: { label: "Role revoked", token: "--conflict-fg" },
  replaced: { label: "Roles replaced", token: "--status-in_progress-fg" },
  blocked: { label: "User blocked", token: "--impact-full-fg" },
  unblocked: { label: "User unblocked", token: "--status-completed-fg" },
};

/** Humanised action label, e.g. `login_success` → `Login success`. */
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
export type AuditCategory = "all" | "auth" | "roles" | "block";

export const AUDIT_CATEGORIES: { id: AuditCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "auth", label: "Auth" },
  { id: "roles", label: "Roles" },
  { id: "block", label: "Block" },
];

const CATEGORY_ACTIONS: Record<Exclude<AuditCategory, "all">, ReadonlySet<AuditAction>> = {
  auth: new Set<AuditAction>(["login_success", "login_failed", "logout_success"]),
  roles: new Set<AuditAction>(["assigned", "revoked", "replaced"]),
  // `unblocked` rides with `blocked` — both are user-block lifecycle events.
  block: new Set<AuditAction>(["blocked", "unblocked"]),
};

/** Whether an action belongs to the given category (`all` matches everything). */
export function auditActionInCategory(action: AuditAction, category: AuditCategory): boolean {
  if (category === "all") return true;
  return CATEGORY_ACTIONS[category].has(action);
}

/**
 * Backend `action` filter values for a category — the CSV the server expects
 * (`action=login_success,login_failed,logout_success`). `all` returns an empty
 * list (no filter). Used to translate a category chip into the wire param.
 */
export function auditCategoryActions(category: AuditCategory): AuditAction[] {
  if (category === "all") return [];
  return [...CATEGORY_ACTIONS[category]];
}
