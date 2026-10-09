import { type AuditAction, type AuditEventAction, isKnownAuditAction } from "./audit-log";

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
 *
 * Credential events (`password.changed` / `password.reset`) take the amber
 * in-progress token: not a failure, but something an operator scanning the log
 * should notice — both evict sessions. Configuration-shaped events
 * (`auth_method.toggled`, `user.tags_changed`, `provider.linked`) take the same
 * blue as `roles.changed` / `integration.updated`. `provider.linked` is blue
 * rather than green on purpose: the backend files a REFUSED link under the same
 * action (the reason is in the details), so a success colour would lie.
 *
 * Catalog and invitation events follow the integration lifecycle: created /
 * updated are configuration blue, a revoked invitation takes the cancel token.
 * Archiving a resource or channel is soft and reversible, so it takes the
 * neutral logout grey rather than a destructive red, and unarchiving reads as
 * a recovery, like `user.unblocked`.
 *
 * `session.revoked` takes `user.blocked`'s red: both are an account's access
 * being cut off, and a revocation for token reuse is a possible compromise —
 * the row an operator scanning the Users chip must not miss.
 */
const ACTION_META: Record<AuditAction, { label: string; token: string }> = {
  "login.success": { label: "Login success", token: "--status-completed-fg" },
  "login.failed": { label: "Login failed", token: "--destructive-fg" },
  "logout.success": { label: "Logout", token: "--fg-dim" },
  "password.changed": { label: "Password changed", token: "--status-in_progress-fg" },
  "password.reset": { label: "Password reset", token: "--status-in_progress-fg" },
  "provider.linked": { label: "Provider linked", token: "--status-planned-fg" },
  "session.revoked": { label: "Session revoked", token: "--impact-full-fg" },
  "auth_method.toggled": { label: "Sign-in method toggled", token: "--status-planned-fg" },
  "roles.changed": { label: "Roles changed", token: "--status-planned-fg" },
  "user.tags_changed": { label: "User tags changed", token: "--status-planned-fg" },
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
  "integration.created": { label: "Integration created", token: "--status-planned-fg" },
  "integration.updated": { label: "Integration updated", token: "--status-planned-fg" },
  "integration.deleted": { label: "Integration deleted", token: "--conflict-fg" },
  "invitation.created": { label: "Invitation created", token: "--status-planned-fg" },
  "invitation.revoked": { label: "Invitation revoked", token: "--conflict-fg" },
  "resource.created": { label: "Resource created", token: "--status-planned-fg" },
  "resource.updated": { label: "Resource updated", token: "--status-planned-fg" },
  "resource.archived": { label: "Resource archived", token: "--fg-dim" },
  "resource.unarchived": { label: "Resource unarchived", token: "--status-completed-fg" },
  "notify_channel.created": { label: "Channel created", token: "--status-planned-fg" },
  "notify_channel.updated": { label: "Channel updated", token: "--status-planned-fg" },
  "notify_channel.archived": { label: "Channel archived", token: "--fg-dim" },
  "notify_channel.unarchived": { label: "Channel unarchived", token: "--status-completed-fg" },
};

/**
 * Dot colour for an action this build does not model — the neutral token, so an
 * unknown row reads as "recorded, not classified" rather than borrowing the
 * meaning of a known one.
 */
export const UNKNOWN_ACTION_TOKEN = "--fg-dim";

/**
 * Humanised action label, e.g. `login.success` → `Login success`. An action the
 * UI does not model is labelled with its raw wire value: the row is still a real
 * record and must not render blank or throw.
 */
export function auditActionLabel(action: AuditEventAction): string {
  return isKnownAuditAction(action) ? ACTION_META[action].label : action;
}

/** CSS custom-property name for the action's 8px dot colour. */
export function auditActionDotToken(action: AuditEventAction): string {
  return isKnownAuditAction(action) ? ACTION_META[action].token : UNKNOWN_ACTION_TOKEN;
}

/**
 * Actions whose metadata is a sign-in context — IP / user agent / session, plus
 * a reason when the attempt was refused or the session revoked. Password
 * changes, provider links and session revocations are written with the same
 * payload as a login (the request's IP and user agent), so the table and the
 * expanded detail read them the same way. This is about the PAYLOAD, not the
 * chip: those four sit under Users, because they act on an account rather than
 * open a session.
 */
const SIGN_IN_SHAPED: ReadonlySet<AuditAction> = new Set<AuditAction>([
  "login.success",
  "login.failed",
  "password.changed",
  "password.reset",
  "provider.linked",
  "session.revoked",
]);

export function isSignInShaped(action: AuditEventAction): boolean {
  return isKnownAuditAction(action) && SIGN_IN_SHAPED.has(action);
}

/**
 * Human wording for a `session.revoked` reason. The backend writes a fixed
 * vocabulary; a value this build does not know is shown raw rather than
 * hidden, the same rule as an unknown action.
 */
const REVOKE_REASON_LABELS: Record<string, string> = {
  token_reuse: "Refresh token reused",
};

export function auditRevokeReasonLabel(reason: string): string {
  return REVOKE_REASON_LABELS[reason] ?? reason;
}

/**
 * Category filter chips for the filter bar. The per-enum chips were collapsed
 * into categories (frozen decision 2026-06-10); the categories themselves were
 * regrouped for v0.3.1 (owner-approved 2026-10-08) so that every action has
 * exactly one chip: Sign-ins / Users / Settings / Maintenance. `All` selects
 * everything; each category covers a group of wire actions. The row dot-colour
 * still distinguishes the specific event inside the table.
 *
 * The ids are the backend's facet keys (`apiauthmodels.AuditFacets`), so a
 * chip's count is `facets[id]` with no translation table in between.
 */
export type AuditCategory = "all" | "sign_in" | "users" | "settings" | "maintenance";

export const AUDIT_CATEGORIES: { id: AuditCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "sign_in", label: "Sign-ins" },
  { id: "users", label: "Users" },
  { id: "settings", label: "Settings" },
  { id: "maintenance", label: "Maintenance" },
];

/**
 * Mirrors the backend's own category map (`auditActionCategories` in
 * `internal/entity/audit.go`), which is what the facet counts are computed
 * from. A chip that asks for fewer actions than its facet counts shows a number
 * the table never reaches.
 */
const CATEGORY_ACTIONS: Record<Exclude<AuditCategory, "all">, ReadonlySet<AuditAction>> = {
  // Sessions starting, being refused, and ending.
  sign_in: new Set<AuditAction>(["login.success", "login.failed", "logout.success"]),
  // One account changing — its roles, tags, block state, credentials or linked
  // providers, or a session the system revoked. Password, provider and session
  // events are here rather than under Sign-ins: nobody signed in or out.
  users: new Set<AuditAction>([
    "roles.changed",
    "user.tags_changed",
    "user.blocked",
    "user.unblocked",
    "password.changed",
    "password.reset",
    "provider.linked",
    "session.revoked",
    // A pending account: who may get in, and with which roles.
    "invitation.created",
    "invitation.revoked",
  ]),
  // The instance's own configuration: which sign-in methods it accepts, which
  // integrations it talks to, and the resource and channel catalogs
  // maintenances draw from.
  settings: new Set<AuditAction>([
    "auth_method.toggled",
    "integration.created",
    "integration.updated",
    "integration.deleted",
    "resource.created",
    "resource.updated",
    "resource.archived",
    "resource.unarchived",
    "notify_channel.created",
    "notify_channel.updated",
    "notify_channel.archived",
    "notify_channel.unarchived",
  ]),
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

/**
 * Whether an action belongs to the given category (`all` matches everything).
 * An action the UI does not model belongs to `all` only: the chips ask the
 * server for a list of KNOWN actions, so an unknown one cannot appear under a
 * chip, and claiming otherwise would make the client disagree with the server.
 */
export function auditActionInCategory(action: AuditEventAction, category: AuditCategory): boolean {
  if (category === "all") return true;
  return isKnownAuditAction(action) && CATEGORY_ACTIONS[category].has(action);
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
