/**
 * In-memory mock data for Phase 4 UI. Replaced by real BFF queries in Phase 5.
 *
 * The shapes match `src/domain/**` exactly so swapping to real fetch is a
 * one-line change at the query hook level.
 */

import type { Maintenance, MaintenanceDetail } from "@/domain/maintenance/maintenance";

const nowIso = (offsetMin = 0) => new Date(Date.now() + offsetMin * 60_000).toISOString();
const todayAt = (h: number, m = 0, dayOffset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
/** Shift an ISO instant by whole minutes (negative = earlier). */
const shiftIso = (iso: string, offsetMin: number) =>
  new Date(new Date(iso).getTime() + offsetMin * 60_000).toISOString();

// Mock maintenances carry no notify targets (the read view doesn't expose them
// yet); `withNotifyTargets` stamps the empty array so each literal stays terse.
const withNotifyTargets = (list: Omit<Maintenance, "notify_targets">[]): Maintenance[] =>
  list.map((m) => ({ ...m, notify_targets: [] }));

export const MOCK_MAINTENANCES: Maintenance[] = withNotifyTargets([
  {
    id: "m-1001",
    reference: "MNT-1001",
    title: "Patch postgres primary",
    description: "Apply security patch, restart primary, verify replication.",
    status: "in_progress",
    impact: "partial_outage",
    scope: "resource",
    planned_period: { start: todayAt(14, 0), end: todayAt(16, 0) },
    actual_period: { start: todayAt(14, 5), end: todayAt(16, 0) },
    resources: [
      { id: "r-1", name: "orders-db", type: "database" },
      { id: "r-2", name: "users-db", type: "database" },
    ],
    steps: [
      { id: "s-1", title: "Notify on-call", duration: "2m", status: "done" },
      { id: "s-2", title: "Drain pool", duration: "5m", status: "done" },
      { id: "s-3", title: "Apply patch", duration: "12m", status: "in_progress" },
      { id: "s-4", title: "Run smoke", duration: "3m", status: "pending" },
      { id: "s-5", title: "Restore traffic", duration: "2m", status: "pending" },
    ],
    created_at: nowIso(-60 * 24 * 2),
    updated_at: nowIso(-30),
  },
  {
    id: "m-1002",
    reference: "MNT-1002",
    title: "API gateway upgrade",
    description: "Rolling upgrade across 4 nodes.",
    status: "planned",
    impact: "none",
    scope: "resource",
    planned_period: { start: todayAt(18, 0, 1), end: todayAt(19, 0, 1) },
    resources: [{ id: "r-3", name: "api-gateway", type: "service" }],
    steps: [
      { id: "s-1", title: "Drain node 1", status: "pending" },
      { id: "s-2", title: "Upgrade node 1", status: "pending" },
      { id: "s-3", title: "Repeat for nodes 2..4", status: "pending" },
    ],
    created_at: nowIso(-60 * 24),
    updated_at: nowIso(-60 * 24),
  },
  {
    id: "m-1003",
    reference: "MNT-1003",
    title: "Region failover drill",
    description: "Planned DR drill — EU-west → EU-central.",
    status: "planned",
    impact: "full_outage",
    scope: "global",
    planned_period: { start: todayAt(9, 0, 2), end: todayAt(11, 0, 2) },
    resources: [
      { id: "r-4", name: "edge-eu", type: "cluster" },
      { id: "r-5", name: "auth-svc", type: "service" },
    ],
    steps: [],
    created_at: nowIso(-60 * 48),
    updated_at: nowIso(-60 * 48),
  },
  {
    id: "m-1004",
    reference: "MNT-1004",
    title: "Cache flush",
    status: "completed",
    impact: "none",
    scope: "resource",
    planned_period: { start: todayAt(2, 0, -1), end: todayAt(2, 30, -1) },
    actual_period: { start: todayAt(2, 0, -1), end: todayAt(2, 25, -1) },
    resources: [{ id: "r-6", name: "redis-cache", type: "cache" }],
    steps: [
      { id: "s-1", title: "Snapshot keys", status: "done" },
      { id: "s-2", title: "FLUSHDB", status: "done" },
    ],
    created_at: nowIso(-60 * 24 * 3),
    updated_at: nowIso(-60 * 24),
  },
  {
    id: "m-1005",
    reference: "MNT-1005",
    title: "Decommission legacy worker",
    status: "canceled",
    impact: "none",
    scope: "resource",
    planned_period: { start: todayAt(15, 0, -2), end: todayAt(16, 0, -2) },
    resources: [{ id: "r-7", name: "worker-legacy", type: "service" }],
    steps: [],
    cancel_reason: "rescheduled",
    cancel_reason_comment: "Pushed to next sprint after capacity review.",
    created_at: nowIso(-60 * 72),
    updated_at: nowIso(-60 * 48),
  },
  {
    id: "m-1006",
    reference: "MNT-1006",
    title: "Draft: storage rebalance",
    status: "draft",
    impact: "partial_outage",
    scope: "resource",
    planned_period: { start: todayAt(10, 0, 5), end: todayAt(12, 0, 5) },
    resources: [{ id: "r-8", name: "object-storage", type: "service" }],
    steps: [],
    created_at: nowIso(-60),
    updated_at: nowIso(-60),
  },
]);

export function getMockMaintenanceDetail(id: string): MaintenanceDetail | undefined {
  const base = MOCK_MAINTENANCES.find((m) => m.id === id);
  if (!base) return undefined;
  return {
    ...base,
    created_by: "Alice Operator",
    approver: base.status === "draft" ? undefined : "Platform Admin",
    // A 1-day and a 1-hour reminder off the planned start, so the edit form's
    // hydration (fire_at → offset → preset) has something to resolve. Only
    // queued once approved, hence `scheduled` tracking the draft state.
    reminders: [
      { id: `${base.id}-rem-1`, fire_at: shiftIso(base.planned_period.start, -24 * 60) },
      { id: `${base.id}-rem-2`, fire_at: shiftIso(base.planned_period.start, -60) },
    ].map((r) => ({ ...r, scheduled: base.status !== "draft" })),
    actions: {
      can_edit: base.status === "draft" || base.status === "planned",
      can_cancel: base.status !== "completed" && base.status !== "canceled",
      can_approve: base.status === "draft",
      can_start: base.status === "planned",
      can_complete: base.status === "in_progress",
    },
    // Deliberately asymmetric on two axes, because a uniform fixture cannot
    // tell correct code from broken code here:
    //
    //  - scope: one `resource` neighbour and one `global` one that still
    //    carries a resource intersection, so both halves of the approve echo
    //    are exercised (SPEC §3.2.1).
    //  - known_at_approval: `m-1002` (planned) mixes false + true, so a UI that
    //    flags everything is distinguishable from one that reads the flag.
    //    Unreviewed comes FIRST, mirroring the server's own ordering.
    //
    // `m-1006` is the only draft, and it carries all-`false` conflicts on
    // purpose: that is exactly the input where a missing status gate would
    // wrongly render "not seen at approval" markers.
    conflicts:
      base.id === "m-1002"
        ? [
            {
              maintenance_id: "m-1100",
              reference: "MNT-1100",
              title: "Region-wide network drill",
              overlap_start: todayAt(18, 45, 1),
              overlap_end: todayAt(19, 30, 1),
              scope: "global" as const,
              resources: [{ id: "r-1", name: "orders-db" }],
              known_at_approval: false,
            },
            {
              maintenance_id: "m-1099",
              reference: "MNT-1099",
              title: "Edge node restart",
              overlap_start: todayAt(18, 30, 1),
              overlap_end: todayAt(19, 0, 1),
              scope: "resource" as const,
              resources: [{ id: "r-2", name: "edge-eu" }],
              known_at_approval: true,
            },
          ]
        : base.id === "m-1006"
          ? [
              {
                maintenance_id: "m-1101",
                reference: "MNT-1101",
                title: "Object storage compaction",
                overlap_start: todayAt(10, 30, 5),
                overlap_end: todayAt(11, 0, 5),
                scope: "resource" as const,
                resources: [{ id: "r-8", name: "object-storage" }],
                known_at_approval: false,
              },
            ]
          : [],
    revision: 1,
  };
}
