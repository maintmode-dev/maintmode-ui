import { describe, expect, it } from "vitest";

import { normalizeCalendarResponse, normalizeMaintenanceView } from "@/server/backend/maintenance/adapters";

describe("maintenance backend adapters", () => {
  it("normalizes maintenance details without leaking backend date/action/conflict shapes", () => {
    const result = normalizeMaintenanceView({
      maintenance: {
        id: "m1",
        title: "DB upgrade",
        description: "Upgrade the primary database",
        planned_time_start: "2026-02-20T10:00:00Z",
        planned_time_end: "2026-02-20T11:30:00Z",
        actual_time_start: "2026-02-20T10:05:00Z",
        actual_time_end: "2026-02-20T11:00:00Z",
        resources: [{ id: "r1", name: "Primary DB", type: "database" }],
        scope: "resource",
        impact: "partial_outage",
        status: "canceled",
        created_at: "2026-02-19T08:00:00Z",
        updated_at: "2026-02-19T09:00:00Z",
        revision: 7,
        steps: [
          {
            id: "s1",
            order: 1,
            description: "Apply migration",
            rollback_description: "Restore snapshot",
            duration: "1h30m",
            status: "completed",
            planned_time_start: "2026-02-20T10:00:00Z",
            planned_time_end: "2026-02-20T11:30:00Z",
          },
        ],
      },
      conflicts: [
        {
          maintenance_id: "m2",
          title: "API deploy",
          overlap_start: "2026-02-20T10:30:00Z",
          overlap_end: "2026-02-20T11:00:00Z",
          scope: "resource",
          resources: [{ id: "r1", name: "Primary DB", type: "database" }],
        },
      ],
      actions: {
        can_approve: false,
        can_cancel: false,
        can_edit: true,
        can_finish: false,
        can_start: false,
      },
    });

    expect(result).toMatchObject({
      id: "m1",
      status: "canceled",
      planned_start_at: "2026-02-20T10:00:00.000Z",
      planned_end_at: "2026-02-20T11:30:00.000Z",
      actual_start_at: "2026-02-20T10:05:00.000Z",
      actual_end_at: "2026-02-20T11:00:00.000Z",
      revision: 7,
      has_conflict: true,
      actions: {
        can_edit: true,
      },
    });
    expect(result.conflicts[0]).toMatchObject({
      maintenance_id: "m2",
      maintenance_title: "API deploy",
      resource_name: "Primary DB",
      overlap_start: "2026-02-20T10:30:00.000Z",
    });
    expect(result.steps).toEqual([
      {
        id: "s1",
        order: 1,
        description: "Apply migration",
        rollback_description: "Restore snapshot",
        duration_minutes: 90,
        status: "completed",
        planned_start_at: "2026-02-20T10:00:00.000Z",
        planned_end_at: "2026-02-20T11:30:00.000Z",
      },
    ]);
  });

  it("keeps optional steps optional and normalizes calendar resources from lookup data", () => {
    const details = normalizeMaintenanceView({
      maintenance: {
        id: "m1",
        title: "Global deploy",
        description: "Global maintenance",
        planned_time_start: "2026-02-20T10:00:00Z",
        planned_time_end: "2026-02-20T11:00:00Z",
        resources: [],
        scope: "global",
        impact: "none",
        status: "planned",
        created_at: "2026-02-19T08:00:00Z",
        revision: 1,
      },
      conflicts: [],
      actions: {
        can_approve: true,
        can_cancel: true,
        can_edit: true,
        can_finish: false,
        can_start: false,
      },
    });

    const calendar = normalizeCalendarResponse(
      {
        events: [
          {
            id: "m2",
            title: "Resource deploy",
            status: "planned",
            scope: "resource",
            impact: "none",
            start: "2026-02-21T10:00:00Z",
            end: "2026-02-21T11:00:00Z",
            resource_ids: ["r1"],
            conflicts_count: 2,
          },
        ],
        meta: {
          count: 1,
          truncated: false,
        },
      },
      new Map([["r1", { id: "r1", name: "API", type: "service" }]]),
    );

    expect(details.steps).toBeUndefined();
    expect(calendar.maintenances[0]).toMatchObject({
      resources: [{ id: "r1", name: "API", type: "service" }],
      has_conflict: true,
    });
  });
});
