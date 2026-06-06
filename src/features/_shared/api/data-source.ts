/**
 * Per-endpoint data source flag. Lets each query hook pick `bff` (real
 * fetch through /api/**) or `mock` (in-memory fixture) based on what's
 * available on the backend today.
 *
 * Defaults match the BE state on 2026-05-26 (RUK-121 description):
 *
 * | Endpoint                          | Default | Ticket   |
 * |-----------------------------------|---------|----------|
 * | calendar (maintenance list)       | bff     | shipped  |
 * | maintenance detail (/ui/v1/{id})  | bff     | shipped  |
 * | maintenance create/edit/actions   | bff     | shipped  |
 * | cancel reasons                    | bff     | RUK-62   |
 * | assignable users (approver)       | bff     | RUK-161  |
 * | maintenance audit (per-id)        | mock    | RUK-42   |
 * | users list / block / roles        | bff     | RUK-159  |
 * | global audit log                  | bff     | shipped  |
 *
 * When a BE ticket lands, flip the flag here and remove the mock branch
 * in the corresponding query hook. Once a hook is fully BFF-only with no
 * mock branch left (e.g. resources/resource detail after RUK-158, or
 * invitations after RUK-160), its flag is dropped from this object rather
 * than left as dead config.
 *
 * NOT included (and intentionally so):
 *  - Request-changes button (RUK-41) — the button itself isn't on the
 *    page yet; will land as a new flag at the same time as the UI.
 *  - Sign-in provider connect/disconnect (RUK-92) — the cards are
 *    inline-disabled with a static "soon" hint; no query yet.
 */

export type DataMode = "bff" | "mock";

export const DATA_SOURCE = {
  calendar: "bff" as DataMode,
  maintenanceDetail: "bff" as DataMode,
  maintenanceWrites: "bff" as DataMode,
  cancelReasons: "bff" as DataMode, // RUK-62
  assignableUsers: "bff" as DataMode, // RUK-161
  // resources / resourceDetail: BFF-only since RUK-158 — no flag, no mock branch.
  // invitations: BFF-only since RUK-160 — no flag, no mock branch.
  maintenanceAudit: "mock" as DataMode, // RUK-42
  users: "bff" as DataMode, // RUK-159 (users list + block/unblock + roles)
  globalAudit: "bff" as DataMode,
} as const;
