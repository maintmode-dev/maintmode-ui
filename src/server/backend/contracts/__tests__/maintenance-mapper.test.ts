import { describe, expect, it } from "vitest";

import {
  mapAssignableUser,
  mapCalendarResponse,
  mapCancelReason,
  mapCancelReasonView,
  mapConflict,
  mapDraftToCreateRequest,
  mapImpact,
  mapMaintenanceView,
  mapPeriod,
  mapScope,
  mapStatus,
  mapStep,
  mapStepStatus,
  mapUserSummary,
} from "@/server/backend/contracts/maintenance-mapper";
import type {
  CalendarViewResponseDto,
  MaintenanceViewResponseDto,
} from "@/server/backend/contracts/maintmode-dto";
import type { MaintenanceDraftInput } from "@/domain/maintenance/maintenance";

describe("mapScope", () => {
  it("passes through 'resource'", () => {
    expect(mapScope("resource")).toBe("resource");
  });

  it("passes through 'global'", () => {
    expect(mapScope("global")).toBe("global");
  });

  it("defaults unknown/undefined to 'global'", () => {
    expect(mapScope("public")).toBe("global");
    expect(mapScope(undefined)).toBe("global");
  });
});

describe("mapStepStatus", () => {
  it("maps every backend step status", () => {
    expect(mapStepStatus("unknown")).toBe("pending");
    expect(mapStepStatus("planned")).toBe("pending");
    expect(mapStepStatus("started")).toBe("in_progress");
    expect(mapStepStatus("completed")).toBe("done");
    expect(mapStepStatus("canceled")).toBe("skipped");
  });

  it("defaults unrecognized values to 'pending'", () => {
    expect(mapStepStatus(undefined)).toBe("pending");
    expect(mapStepStatus("bogus")).toBe("pending");
  });
});

describe("mapStatus", () => {
  it("passes through every known status", () => {
    for (const s of ["draft", "planned", "in_progress", "completed", "canceled"]) {
      expect(mapStatus(s)).toBe(s);
    }
  });

  it("defaults unknown/missing to 'planned'", () => {
    expect(mapStatus("bogus")).toBe("planned");
    expect(mapStatus("")).toBe("planned");
    expect(mapStatus(undefined)).toBe("planned");
  });
});

describe("mapImpact", () => {
  it("passes through every known impact", () => {
    for (const i of ["none", "partial_outage", "full_outage"]) {
      expect(mapImpact(i)).toBe(i);
    }
  });

  it("defaults unknown/missing to 'none'", () => {
    expect(mapImpact("catastrophic")).toBe("none");
    expect(mapImpact(undefined)).toBe("none");
  });
});

describe("mapCancelReason", () => {
  it("passes through every known reason", () => {
    for (const r of ["conflict", "incident", "business_decision", "rescheduled", "mistake"]) {
      expect(mapCancelReason(r)).toBe(r);
    }
  });

  it("returns undefined for unknown/missing", () => {
    expect(mapCancelReason("because")).toBeUndefined();
    expect(mapCancelReason(undefined)).toBeUndefined();
  });
});

describe("mapUserSummary", () => {
  it("returns the display name when present", () => {
    expect(mapUserSummary({ display_name: "Alice Operator" })).toBe("Alice Operator");
  });

  it("falls back to 'Unknown user' when the display name is missing or blank", () => {
    expect(mapUserSummary({ display_name: "" })).toBe("Unknown user");
    expect(mapUserSummary({ display_name: "   " })).toBe("Unknown user");
    expect(mapUserSummary({})).toBe("Unknown user");
    expect(mapUserSummary(undefined)).toBe("Unknown user");
  });

  it("preserves the backend's literal 'Unknown user'", () => {
    expect(mapUserSummary({ display_name: "Unknown user" })).toBe("Unknown user");
  });
});

describe("mapPeriod", () => {
  it("builds a period from flat start/end", () => {
    expect(mapPeriod("2026-06-05T10:00:00Z", "2026-06-05T12:00:00Z")).toEqual({
      start: "2026-06-05T10:00:00Z",
      end: "2026-06-05T12:00:00Z",
    });
  });

  it("returns undefined when both ends are absent", () => {
    expect(mapPeriod(undefined, undefined)).toBeUndefined();
  });

  it("fills the missing side with an empty string when only one end is present", () => {
    expect(mapPeriod("2026-06-05T10:00:00Z", undefined)).toEqual({
      start: "2026-06-05T10:00:00Z",
      end: "",
    });
  });
});

describe("mapStep", () => {
  it("maps description→title, order, and status", () => {
    expect(
      mapStep(
        {
          id: "s-1",
          order: 2,
          description: "Apply patch",
          duration: "12m",
          rollback_description: "Restore from snapshot",
          status: "started",
        },
        0,
      ),
    ).toEqual({
      id: "s-1",
      title: "Apply patch",
      description: "Apply patch",
      order: 2,
      duration: "12m",
      rollback_description: "Restore from snapshot",
      status: "in_progress",
    });
  });

  it("derives a 1-based order from the index when the backend omits it", () => {
    expect(mapStep({ id: "s-1", description: "First", status: "planned" }, 0).order).toBe(1);
    expect(mapStep({ id: "s-2", description: "Second", status: "planned" }, 1).order).toBe(2);
  });

  it("falls back to 'Untitled step' for an empty description", () => {
    expect(mapStep({ id: "s-1", description: "", status: "planned" }, 0).title).toBe("Untitled step");
    expect(mapStep({ id: "s-2", status: "planned" }, 0).title).toBe("Untitled step");
  });
});

describe("mapConflict", () => {
  it("maps the flat conflict and substitutes a title fallback", () => {
    expect(
      mapConflict({
        maintenance_id: "m-1099",
        overlap_start: "2026-06-05T18:30:00Z",
        overlap_end: "2026-06-05T19:00:00Z",
      }),
    ).toEqual({
      maintenance_id: "m-1099",
      title: "Untitled maintenance",
      overlap_start: "2026-06-05T18:30:00Z",
      overlap_end: "2026-06-05T19:00:00Z",
    });
  });

  it("keeps the title when present and drops wire-only fields (scope/resources)", () => {
    expect(
      mapConflict({
        maintenance_id: "m-1099",
        title: "Edge node restart",
        scope: "resource",
        overlap_start: "2026-06-05T18:30:00Z",
        overlap_end: "2026-06-05T19:00:00Z",
        resources: [{ id: "r-4", name: "edge-eu" }],
      }),
    ).toEqual({
      maintenance_id: "m-1099",
      title: "Edge node restart",
      overlap_start: "2026-06-05T18:30:00Z",
      overlap_end: "2026-06-05T19:00:00Z",
    });
  });
});

describe("mapCalendarResponse", () => {
  it("projects flat events into domain maintenances with a planned_period", () => {
    const dto: CalendarViewResponseDto = {
      events: [
        {
          id: "m-1",
          title: "Patch postgres",
          start: "2026-06-05T14:00:00Z",
          end: "2026-06-05T16:00:00Z",
          status: "in_progress",
          impact: "partial_outage",
          scope: "resource",
          created_by: { display_name: "Alice Operator" },
        },
      ],
      meta: { count: 1, truncated: false },
    };

    expect(mapCalendarResponse(dto)).toEqual([
      {
        id: "m-1",
        title: "Patch postgres",
        status: "in_progress",
        impact: "partial_outage",
        scope: "resource",
        planned_period: { start: "2026-06-05T14:00:00Z", end: "2026-06-05T16:00:00Z" },
        resources: [],
        steps: [],
        created_by: "Alice Operator",
        created_at: "2026-06-05T14:00:00Z",
        updated_at: "2026-06-05T14:00:00Z",
      },
    ]);
  });

  it("leaves created_by undefined when the event has no author", () => {
    const [m] = mapCalendarResponse({
      events: [{ id: "m-2", start: "2026-06-05T10:00:00Z", end: "2026-06-05T11:00:00Z" }],
    });
    expect(m.created_by).toBeUndefined();
  });

  it("handles a missing events array", () => {
    expect(mapCalendarResponse({})).toEqual([]);
  });
});

describe("mapMaintenanceView", () => {
  const base: MaintenanceViewResponseDto = {
    maintenance: {
      id: "m-1001",
      title: "Patch postgres primary",
      description: "Apply security patch",
      status: "in_progress",
      impact: "partial_outage",
      scope: "global",
      planned_time_start: "2026-06-05T14:00:00Z",
      planned_time_end: "2026-06-05T16:00:00Z",
      actual_time_start: "2026-06-05T14:05:00Z",
      actual_time_end: "2026-06-05T16:00:00Z",
      revision: 7,
      created_by: { display_name: "Alice Operator" },
      approver: { display_name: "" },
      resources: [{ id: "r-1", name: "orders-db" }],
      steps: [{ id: "s-1", order: 1, description: "Notify on-call", status: "completed" }],
      created_at: "2026-06-01T00:00:00Z",
      updated_at: "2026-06-05T13:30:00Z",
    },
    actions: { can_edit: true, can_cancel: true },
    conflicts: [
      {
        maintenance_id: "m-1099",
        title: "Edge node restart",
        overlap_start: "2026-06-05T15:00:00Z",
        overlap_end: "2026-06-05T15:30:00Z",
      },
    ],
  };

  it("carries the integer revision through", () => {
    expect(mapMaintenanceView(base).revision).toBe(7);
  });

  it("leaves revision undefined when the backend omits it", () => {
    const detail = mapMaintenanceView({
      ...base,
      maintenance: { ...base.maintenance, revision: undefined },
    });
    expect(detail.revision).toBeUndefined();
  });

  it("maps flat times into planned/actual periods", () => {
    const detail = mapMaintenanceView(base);
    expect(detail.planned_period).toEqual({
      start: "2026-06-05T14:00:00Z",
      end: "2026-06-05T16:00:00Z",
    });
    expect(detail.actual_period).toEqual({
      start: "2026-06-05T14:05:00Z",
      end: "2026-06-05T16:00:00Z",
    });
  });

  it("omits actual_period when the backend sends no actual times", () => {
    const detail = mapMaintenanceView({
      ...base,
      maintenance: { ...base.maintenance, actual_time_start: undefined, actual_time_end: undefined },
    });
    expect(detail.actual_period).toBeUndefined();
  });

  it("applies the 'Unknown user' fallback to author and approver", () => {
    const detail = mapMaintenanceView(base);
    expect(detail.created_by).toBe("Alice Operator");
    // approver display_name was blank → fallback
    expect(detail.approver).toBe("Unknown user");
  });

  it("defaults missing action flags to false", () => {
    const detail = mapMaintenanceView(base);
    expect(detail.actions).toEqual({
      can_edit: true,
      can_cancel: true,
      can_approve: false,
      can_start: false,
      can_complete: false,
    });
  });

  it("maps steps, resources and conflicts", () => {
    const detail = mapMaintenanceView(base);
    expect(detail.steps[0]).toMatchObject({ title: "Notify on-call", status: "done", order: 1 });
    expect(detail.resources).toEqual([{ id: "r-1", name: "orders-db" }]);
    expect(detail.conflicts[0]).toMatchObject({ maintenance_id: "m-1099", title: "Edge node restart" });
  });

  it("leaves created_by undefined when the backend omits the author", () => {
    const detail = mapMaintenanceView({
      ...base,
      maintenance: { ...base.maintenance, created_by: undefined },
    });
    expect(detail.created_by).toBeUndefined();
  });
});

describe("mapDraftToCreateRequest", () => {
  const base: MaintenanceDraftInput = {
    title: "Patch orders-db",
    description: "Rolling restart",
    planned_start: "2026-06-10T22:00:00Z",
    scope: "resource",
    impact: "partial_outage",
    resource_ids: ["r-1", "r-2"],
    steps: [
      { order: 1, description: "Drain traffic", duration: "1h30m", rollback_description: "Re-add node" },
      { order: 2, description: "Restart", duration: "10m" },
    ],
    approver_user_id: "u-9",
    notify_target_channel_ids: ["c-1", "c-2"],
  };

  it("maps resources to id refs and keeps the human duration string on steps", () => {
    const req = mapDraftToCreateRequest(base);
    expect(req.resources).toEqual([{ id: "r-1" }, { id: "r-2" }]);
    expect(req.steps[0]).toEqual({
      order: 1,
      description: "Drain traffic",
      duration: "1h30m",
      rollback_description: "Re-add node",
    });
    expect(req.steps[1]).toEqual({ order: 2, description: "Restart", duration: "10m" });
  });

  it("folds notify channel ids into the object shape the backend requires", () => {
    const req = mapDraftToCreateRequest(base);
    expect(req.notify_targets).toEqual({ channel_ids: ["c-1", "c-2"] });
  });

  it("sends an empty channel_ids array rather than omitting notify_targets", () => {
    const req = mapDraftToCreateRequest({ ...base, notify_target_channel_ids: [] });
    expect(req.notify_targets).toEqual({ channel_ids: [] });
  });

  it("drops resources for global scope", () => {
    const req = mapDraftToCreateRequest({ ...base, scope: "global" });
    expect(req.resources).toEqual([]);
  });

  it("omits empty optional fields rather than sending empty strings", () => {
    const req = mapDraftToCreateRequest({
      ...base,
      description: "",
      approver_user_id: "",
      steps: [{ order: 1, description: "Do it", duration: "" }],
    });
    expect(req.description).toBeUndefined();
    expect(req.approver_user_id).toBeUndefined();
    expect(req.steps[0].duration).toBeUndefined();
  });

  it("backfills step order from index when zero/missing", () => {
    const req = mapDraftToCreateRequest({
      ...base,
      steps: [
        { order: 0, description: "First" },
        { order: 0, description: "Second" },
      ],
    });
    expect(req.steps.map((s) => s.order)).toEqual([1, 2]);
  });
});

describe("mapAssignableUser", () => {
  it("maps a full user", () => {
    expect(
      mapAssignableUser({ id: "u-1", display_name: "Ada", email: "ada@x.io", roles: ["reviewer"] }),
    ).toEqual({ id: "u-1", display_name: "Ada", email: "ada@x.io", roles: ["reviewer"] });
  });

  it("falls back to email then 'Unknown user' for a missing display name", () => {
    expect(mapAssignableUser({ id: "u-2", email: "grace@x.io" }).display_name).toBe("grace@x.io");
    expect(mapAssignableUser({ id: "u-3" }).display_name).toBe("Unknown user");
    expect(mapAssignableUser({ id: "u-3" }).roles).toEqual([]);
  });
});

describe("mapCancelReasonView", () => {
  it("maps a known reason, defaulting title to the value when blank", () => {
    expect(mapCancelReasonView({ value: "incident", title: "Active incident", description: "x" })).toEqual({
      value: "incident",
      title: "Active incident",
      description: "x",
    });
    expect(mapCancelReasonView({ value: "mistake", title: "  " })).toEqual({
      value: "mistake",
      title: "mistake",
      description: undefined,
    });
  });

  it("drops reasons whose value is outside the known enum", () => {
    expect(mapCancelReasonView({ value: "deprecated_reason", title: "Old" })).toBeNull();
  });
});
