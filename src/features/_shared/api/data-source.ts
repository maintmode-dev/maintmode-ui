/**
 * Per-endpoint data source flag. Lets each query hook pick `bff` (real
 * fetch through /api/**) or `mock` (in-memory fixture) based on what's
 * available on the backend today.
 *
 * Defaults match the current BE state:
 *
 * | Endpoint                          | Default |
 * |-----------------------------------|---------|
 * | calendar (maintenance list)       | bff     |
 * | maintenance detail (/ui/v1/{id})  | bff     |
 * | maintenance create/edit/actions   | bff     |
 * | cancel reasons                    | bff     |
 * | assignable users (approver)       | bff     |
 * | maintenance audit (per-id)        | bff     |
 * | users list / block / roles        | bff     |
 * | global audit log                  | bff     |
 *
 * When a BE endpoint lands, flip the flag here and remove the mock branch
 * in the corresponding query hook. Once a hook is fully BFF-only with no
 * mock branch left (e.g. resources/resource detail, or invitations), its
 * flag is dropped from this object rather than left as dead config.
 *
 * NOT included (and intentionally so):
 *  - Request-changes button — the button itself isn't on the page yet;
 *    will land as a new flag at the same time as the UI.
 *  - Sign-in provider connect/disconnect — the cards are inline-disabled
 *    with a static "soon" hint; no query yet.
 */

export type DataMode = "bff" | "mock";

export const DATA_SOURCE = {
  calendar: "bff" as DataMode,
  maintenanceDetail: "bff" as DataMode,
  maintenanceWrites: "bff" as DataMode,
  cancelReasons: "bff" as DataMode,
  assignableUsers: "bff" as DataMode,
  // resources / resourceDetail: BFF-only — no flag, no mock branch.
  // invitations: BFF-only — no flag, no mock branch.
  maintenanceAudit: "bff" as DataMode,
  users: "bff" as DataMode, // users list + block/unblock + roles
  globalAudit: "bff" as DataMode,
} as const;
