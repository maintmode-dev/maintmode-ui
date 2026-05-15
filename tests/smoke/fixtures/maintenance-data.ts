/**
 * Deterministic Playwright fixture payloads for the maintmode BFF surface.
 *
 * These mirror the frontend `MaintenanceSummary` / `Resource` contracts
 * (`src/domain/maintenance/models/maintenance.ts`, `src/domain/resource/models/resource.ts`)
 * so that Playwright specs can intercept `/api/maintenance*` / `/api/resources*`
 * and return stable structures without ever reaching a real backend.
 *
 * The dates are pinned to a fixed week so calendar layout snapshots stay
 * stable regardless of when the test runs.
 */

export const FIXTURE_WEEK_START = "2026-05-11T00:00:00.000Z";

export const FIXTURE_RESOURCES = [
  { id: "res-api-gateway", name: "api-gateway", type: "service" as const },
  { id: "res-payments-db", name: "payments-db", type: "database" as const },
  { id: "res-search-cluster", name: "search-cluster", type: "cluster" as const },
];

export const FIXTURE_MAINTENANCE_PLANNED = {
  id: "maint-planned-001",
  title: "Quarterly API gateway rollout",
  description: "Rolling restart of api-gateway nodes after capacity upgrade.",
  status: "planned" as const,
  scope: "resource" as const,
  impact: "minor",
  planned_start_at: "2026-05-12T08:00:00.000Z",
  planned_end_at: "2026-05-12T09:30:00.000Z",
  resources: [FIXTURE_RESOURCES[0]],
  conflicts: [],
  has_conflict: false,
  revision: 1,
  actions: {
    can_approve: true,
    can_cancel: true,
    can_edit: true,
    can_finish: false,
    can_start: true,
  },
  steps: [
    {
      order: 1,
      description: "Drain node A from the load balancer",
      rollback_description: "Re-add node A to the load balancer",
      duration_minutes: 30,
    },
    {
      order: 2,
      description: "Restart api-gateway service on node A",
      rollback_description: "Revert to previous binary on node A",
      duration_minutes: 30,
    },
    {
      order: 3,
      description: "Re-add node A and verify health checks",
      rollback_description: "Page on-call if node A stays unhealthy",
      duration_minutes: 30,
    },
  ],
};

export const FIXTURE_MAINTENANCE_IN_PROGRESS = {
  id: "maint-in-progress-002",
  title: "Search cluster index rebuild",
  description: "Rebuild search-cluster primary index after schema migration.",
  status: "in_progress" as const,
  scope: "resource" as const,
  impact: "major",
  planned_start_at: "2026-05-13T01:00:00.000Z",
  planned_end_at: "2026-05-13T04:00:00.000Z",
  actual_start_at: "2026-05-13T01:05:00.000Z",
  resources: [FIXTURE_RESOURCES[2]],
  conflicts: [],
  has_conflict: false,
  revision: 2,
  actions: {
    can_approve: false,
    can_cancel: true,
    can_edit: false,
    can_finish: true,
    can_start: false,
  },
  steps: [],
};

export const FIXTURE_CALENDAR_RESPONSE = {
  maintenances: [FIXTURE_MAINTENANCE_PLANNED, FIXTURE_MAINTENANCE_IN_PROGRESS],
  resources: FIXTURE_RESOURCES,
  meta: {
    count: 2,
    truncated: false,
  },
};

export const FIXTURE_RESOURCES_RESPONSE = {
  resources: FIXTURE_RESOURCES,
};

export const FIXTURE_MAINTENANCE_BY_ID: Record<string, typeof FIXTURE_MAINTENANCE_PLANNED> = {
  [FIXTURE_MAINTENANCE_PLANNED.id]: FIXTURE_MAINTENANCE_PLANNED,
  [FIXTURE_MAINTENANCE_IN_PROGRESS.id]: FIXTURE_MAINTENANCE_IN_PROGRESS as unknown as typeof FIXTURE_MAINTENANCE_PLANNED,
};
