import { describe, expect, it } from "vitest";

import {
  assertValidDraftInput,
  mapAssignableUser,
  mapCalendarResponse,
  mapCancelReason,
  mapCancelReasonView,
  mapConflict,
  mapDraftToCreateRequest,
  mapDraftToUpdateRequest,
  mapImpact,
  mapReminders,
  mapMaintenanceView,
  mapPeriod,
  mapScope,
  mapStatus,
  mapStep,
  mapStepStatus,
  mapUserSummary,
  parseDraftBody,
} from "@/server/backend/contracts/maintenance-mapper";
import type {
  CalendarViewResponseDto,
  CreateDraftMaintRequestDto,
  MaintenanceViewResponseDto,
  UpdateDraftMaintRequestDto,
} from "@/server/backend/contracts/maintmode-dto";
import { BffValidationError } from "@/server/backend/errors/bff-error";
import type { MaintenanceDraftInput } from "@/domain/maintenance/maintenance";
import { toOffsetFromFireAt } from "@/domain/maintenance/reminders";

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
      // Absent wire scope degrades to `global` through `mapScope`.
      scope: "global",
      resources: [],
      known_at_approval: false,
    });
  });

  /**
   * RUK-247. This test previously asserted the OPPOSITE — it was named "drops
   * wire-only fields (scope/resources)" and pinned the bug: the approve request
   * needs both fields echoed back, and dropping them here made them
   * unreachable, so every approve of a conflicted maintenance 400'd.
   *
   * `toEqual` (not `toMatchObject`) on purpose: an extra key is a regression too.
   */
  it("carries scope and resources through — the approve echo depends on them", () => {
    expect(
      mapConflict({
        maintenance_id: "m-1099",
        title: "Edge node restart",
        scope: "resource",
        overlap_start: "2026-06-05T18:30:00Z",
        overlap_end: "2026-06-05T19:00:00Z",
        // Second resource has NO name — pins the `mapResource` fallback
        // (wire `name` is optional, the domain requires it).
        resources: [{ id: "r-4", name: "edge-eu" }, { id: "r-5" }],
      }),
    ).toEqual({
      maintenance_id: "m-1099",
      title: "Edge node restart",
      overlap_start: "2026-06-05T18:30:00Z",
      overlap_end: "2026-06-05T19:00:00Z",
      scope: "resource",
      resources: [
        { id: "r-4", name: "edge-eu" },
        { id: "r-5", name: "" },
      ],
      known_at_approval: false,
    });
  });

  it("keeps a global conflict's resources — they are the intersection, not the neighbour's own", () => {
    // §3.2.1: a `global` neighbour still carries a non-empty resource
    // intersection, and the backend fingerprints it unconditionally. Dropping
    // it here (or gating the echo on scope) yields a 409 on approve.
    expect(
      mapConflict({
        maintenance_id: "m-2001",
        title: "Global window",
        scope: "global",
        overlap_start: "2026-06-05T18:30:00Z",
        overlap_end: "2026-06-05T19:00:00Z",
        resources: [{ id: "r-9", name: "orders-db" }],
      }).resources,
    ).toEqual([{ id: "r-9", name: "orders-db" }]);
  });

  it("degrades an unrecognized wire scope to global", () => {
    // `"resources"` is the Go constant's plural name (MaintenanceScopeResources)
    // and a plausible typo; the wire enum is singular `"resource"` (§2.2).
    expect(mapConflict({ maintenance_id: "m-3", scope: "resources" }).scope).toBe("global");
  });

  /**
   * RUK-178. `known_at_approval` answers "did the approver see this conflict
   * when they approved". An absent field must read as `false` (not reviewed),
   * never `true`: the backend always sends it, so absence means an older build
   * — and defaulting to `true` would assert an audit fact we do not have.
   */
  it("maps known_at_approval through", () => {
    expect(mapConflict({ maintenance_id: "m-1", known_at_approval: true }).known_at_approval).toBe(true);
    expect(mapConflict({ maintenance_id: "m-1", known_at_approval: false }).known_at_approval).toBe(false);
  });

  it("defaults a missing known_at_approval to false, never true", () => {
    expect(mapConflict({ maintenance_id: "m-1" }).known_at_approval).toBe(false);
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
        notify_targets: [],
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

  it("defaults notify_targets to an empty array when the field is absent", () => {
    expect(mapMaintenanceView(base).notify_targets).toEqual([]);
  });

  it("defaults reminders to an empty array when the field is absent", () => {
    expect(mapMaintenanceView(base).reminders).toEqual([]);
  });

  it("carries the saved reminders through to the detail, for edit hydration", () => {
    const detail = mapMaintenanceView({
      ...base,
      maintenance: {
        ...base.maintenance,
        deferred_notifications: [
          { id: "d-1", fire_at: "2026-07-31T10:00:00Z", scheduled: true },
          { id: "d-2", fire_at: "2026-07-25T10:00:00Z", scheduled: false },
        ],
      },
    });
    expect(detail.reminders).toEqual([
      { id: "d-2", fire_at: "2026-07-25T10:00:00Z", scheduled: false },
      { id: "d-1", fire_at: "2026-07-31T10:00:00Z", scheduled: true },
    ]);
  });

  /**
   * RUK-218, AC-14. The read view documents `mentions` as always an array, never
   * null, so an absent key is an unambiguous "this backend predates mentions" —
   * a free contract-version detect the form uses to hide the field. `[]` is the
   * other answer: supported, nobody tagged. A `?? []` here would erase the
   * difference and the form would render an empty picker against a backend that
   * silently drops whatever it saves.
   */
  it("leaves mentions undefined when the backend omits the key (old deployment)", () => {
    const detail = mapMaintenanceView(base);
    expect(detail.mentions).toBeUndefined();
    expect(detail.mentions).not.toEqual([]);
  });

  it("keeps an empty array as an empty array (supported, nobody tagged)", () => {
    const detail = mapMaintenanceView({
      ...base,
      maintenance: { ...base.maintenance, mentions: [] },
    });
    expect(detail.mentions).toEqual([]);
    expect(detail.mentions).not.toBeUndefined();
  });

  it("carries the tagged people through with their display names, for edit hydration", () => {
    const detail = mapMaintenanceView({
      ...base,
      maintenance: {
        ...base.maintenance,
        mentions: [
          { user_id: "u-1", display_name: "Alice Ops" },
          { user_id: "u-2", display_name: "Unknown user" },
        ],
      },
    });
    expect(detail.mentions).toEqual([
      { user_id: "u-1", display_name: "Alice Ops" },
      { user_id: "u-2", display_name: "Unknown user" },
    ]);
  });

  it("applies the 'Unknown user' fallback to a blank or missing mention name", () => {
    const detail = mapMaintenanceView({
      ...base,
      maintenance: {
        ...base.maintenance,
        mentions: [{ user_id: "u-1", display_name: "  " }, { user_id: "u-2" }],
      },
    });
    // Never dropped — a mention the operator cannot see is a mention they can
    // accidentally clear (SPEC §5.6).
    expect(detail.mentions).toEqual([
      { user_id: "u-1", display_name: "Unknown user" },
      { user_id: "u-2", display_name: "Unknown user" },
    ]);
  });

  it("maps notify_targets defensively", () => {
    const detail = mapMaintenanceView({
      ...base,
      maintenance: {
        ...base.maintenance,
        notify_targets: [
          { id: "c-1", name: "#incidents-eu", transport: "slack" },
          { channel_id: "c-2", name: "oncall", transport: "telegram" },
          { name: "" }, // dropped: no id and no name
        ],
      },
    });
    expect(detail.notify_targets).toEqual([
      { id: "c-1", name: "#incidents-eu", transport: "slack" },
      { id: "c-2", name: "oncall", transport: "telegram" },
    ]);
  });
});

// Read path: the edit screen hydrates its reminder picker from these (backend
// `90488d0e` added `deferred_notifications` to `uimodels.MaintenanceView`).
describe("mapReminders", () => {
  it("maps the view shape to domain reminders", () => {
    expect(mapReminders([{ id: "d-1", fire_at: "2026-07-31T10:00:00Z", scheduled: true }])).toEqual([
      { id: "d-1", fire_at: "2026-07-31T10:00:00Z", scheduled: true },
    ]);
  });

  it("returns an empty list for an absent or empty field", () => {
    expect(mapReminders(undefined)).toEqual([]);
    expect(mapReminders([])).toEqual([]);
  });

  it("defaults scheduled to false (a draft's reminders are not queued yet)", () => {
    expect(mapReminders([{ id: "d-1", fire_at: "2026-07-31T10:00:00Z" }])[0].scheduled).toBe(false);
  });

  it("orders by fire_at even if the backend ever stopped doing so", () => {
    const out = mapReminders([
      { id: "b", fire_at: "2026-08-01T09:00:00Z" },
      { id: "a", fire_at: "2026-07-25T10:00:00Z" },
    ]);
    expect(out.map((r) => r.id)).toEqual(["a", "b"]);
  });

  // A reminder with no instant can't be turned into an offset, so it would
  // render as a phantom row the operator cannot reason about or fix.
  it("drops entries with no fire_at", () => {
    expect(mapReminders([{ id: "d-1" }, { id: "d-2", fire_at: "2026-07-31T10:00:00Z" }])).toEqual([
      { id: "d-2", fire_at: "2026-07-31T10:00:00Z", scheduled: false },
    ]);
  });

  it("drops an empty-string fire_at as well as a missing one", () => {
    expect(mapReminders([{ id: "d-1", fire_at: "" }])).toEqual([]);
  });

  it("tolerates a missing id rather than dropping the reminder", () => {
    // The instant is what the form needs; a blank id still renders and edits.
    expect(mapReminders([{ fire_at: "2026-07-31T10:00:00Z" }])).toEqual([
      { id: "", fire_at: "2026-07-31T10:00:00Z", scheduled: false },
    ]);
  });

  /**
   * The full RUK-216 loop, which no single-layer test covers: the backend
   * stores instants only, so "1 day before" survives a save/reload ONLY if
   * write → read → hydrate → write is a fixed point. Break any one of
   * `toFireAt` / `mapReminders` / `toOffsetFromFireAt` and this fails.
   */
  it("round-trips offsets through the wire and back unchanged", () => {
    const plannedStart = "2026-08-01T10:00:00Z";
    const picked = [7 * 24 * 60, 24 * 60, 60, 15];

    const written = mapDraftToUpdateRequest({
      title: "Patch orders-db",
      description: "Rolling restart",
      planned_start: plannedStart,
      scope: "resource",
      impact: "partial_outage",
      resource_ids: ["r-1"],
      steps: [{ order: 1, description: "Drain traffic", duration: "1h30m" }],
      approver_user_id: "u-9",
      notify_target_channel_ids: ["c-1"],
      reminder_offsets_minutes: picked,
    });

    // What the backend would hand back on the read path.
    const readBack = mapReminders(
      (written.deferred_notifications ?? []).map((n, i) => ({
        id: `d-${i}`,
        fire_at: n.fire_at,
        scheduled: false,
      })),
    );

    const rehydrated = readBack
      .map((r) => toOffsetFromFireAt(plannedStart, r.fire_at))
      .filter((m): m is number => m !== null);

    // Sorted: mapReminders orders by fire_at, so the longest lead time is first.
    expect(rehydrated).toEqual([...picked].sort((a, b) => b - a));
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

  // RUK-216. The wire carries absolute instants; the offsets are UI-side sugar.
  describe("deferred notifications", () => {
    it("resolves reminder offsets against planned_start", () => {
      const req = mapDraftToCreateRequest({
        ...base,
        planned_start: "2026-08-01T10:00:00Z",
        reminder_offsets_minutes: [7 * 24 * 60, 24 * 60, 60, 15],
      });
      expect(req.deferred_notifications).toEqual([
        { fire_at: "2026-07-25T10:00:00.000Z" },
        { fire_at: "2026-07-31T10:00:00.000Z" },
        { fire_at: "2026-08-01T09:00:00.000Z" },
        { fire_at: "2026-08-01T09:45:00.000Z" },
      ]);
    });

    // Create has no "unchanged" state, so omitting is simply the tersest way to
    // say "no reminders". (Update is the one that must send `[]` — see the
    // mapDraftToUpdateRequest suite.)
    it("omits the field entirely for an empty selection", () => {
      const req = mapDraftToCreateRequest({ ...base, reminder_offsets_minutes: [] });
      expect(req).not.toHaveProperty("deferred_notifications");
    });

    it("omits the field when reminders are absent altogether", () => {
      const req = mapDraftToCreateRequest(base);
      expect(req).not.toHaveProperty("deferred_notifications");
    });

    it("omits the field when the start is unparseable rather than sending Invalid Date", () => {
      const req = mapDraftToCreateRequest({
        ...base,
        planned_start: "",
        reminder_offsets_minutes: [60],
      });
      expect(req).not.toHaveProperty("deferred_notifications");
    });

    it("moves every reminder when planned_start changes", () => {
      const offsets = [24 * 60, 60];
      const first = mapDraftToCreateRequest({
        ...base,
        planned_start: "2026-08-01T10:00:00Z",
        reminder_offsets_minutes: offsets,
      });
      const moved = mapDraftToCreateRequest({
        ...base,
        planned_start: "2026-08-02T10:00:00Z",
        reminder_offsets_minutes: offsets,
      });
      expect(first.deferred_notifications).toEqual([
        { fire_at: "2026-07-31T10:00:00.000Z" },
        { fire_at: "2026-08-01T09:00:00.000Z" },
      ]);
      expect(moved.deferred_notifications).toEqual([
        { fire_at: "2026-08-01T10:00:00.000Z" },
        { fire_at: "2026-08-02T09:00:00.000Z" },
      ]);
    });

    it("sits alongside notify_targets, not in place of it", () => {
      const req = mapDraftToCreateRequest({ ...base, reminder_offsets_minutes: [60] });
      expect(req.notify_targets).toEqual({ channel_ids: ["c-1", "c-2"] });
      expect(req.deferred_notifications).toHaveLength(1);
    });
  });

  /**
   * RUK-218, AC-06. The wire wants objects, not bare uuids — a `string[]` body is
   * rejected outright, the same mistyping that silently blocked notify_targets.
   * The criterion has two halves and both are pinned below: a non-empty selection
   * serialises as `[{ user_id }]`, an empty one omits the key.
   */
  describe("mentions", () => {
    it("wraps the selected ids into { user_id } objects (AC-06)", () => {
      const req = mapDraftToCreateRequest({ ...base, mention_user_ids: ["u-1", "u-2"] });
      expect(req.mentions).toEqual([{ user_id: "u-1" }, { user_id: "u-2" }]);
    });

    /**
     * AC-06, and the reason the shape is an object: `["u-1"]` would be rejected
     * outright by the backend binder. `toEqual` against `[{ user_id }]` passes for
     * an object, so this asserts on the serialised bytes — a mapper that emitted
     * bare strings must not slip through.
     */
    it("serialises the objects on the wire, never bare id strings (AC-06)", () => {
      const body = JSON.stringify(mapDraftToCreateRequest({ ...base, mention_user_ids: ["u-1"] }));
      expect(body).toContain('"mentions":[{"user_id":"u-1"}]');
      expect(body).not.toContain('"mentions":["u-1"]');
    });

    // Create has no "unchanged" state, so `[]` and an absent key say the same
    // thing and omitting is the tersest form. Update is the one that must send
    // `[]` — see the mapDraftToUpdateRequest suite.
    it("omits the field entirely for an empty selection (AC-06)", () => {
      const req = mapDraftToCreateRequest({ ...base, mention_user_ids: [] });
      expect(req).not.toHaveProperty("mentions");
    });

    it("omits the field when mentions are absent altogether (AC-06)", () => {
      expect(mapDraftToCreateRequest(base)).not.toHaveProperty("mentions");
    });

    it("collapses duplicate ids the backend would reject", () => {
      const req = mapDraftToCreateRequest({ ...base, mention_user_ids: ["u-1", "u-1", "u-2"] });
      expect(req.mentions).toEqual([{ user_id: "u-1" }, { user_id: "u-2" }]);
    });

    // AC-06 order note: SPEC §1.1 guarantees the backend replays mentions in
    // insertion order (`ORDER BY created_at ASC, id ASC`), so the mapper must not
    // sort or reverse the operator's selection on the way out.
    it("preserves the selection order (AC-06)", () => {
      const req = mapDraftToCreateRequest({ ...base, mention_user_ids: ["u-3", "u-1", "u-2"] });
      expect(req.mentions).toEqual([{ user_id: "u-3" }, { user_id: "u-1" }, { user_id: "u-2" }]);
    });

    it("sits alongside notify_targets and the reminders, not in place of them", () => {
      const req = mapDraftToCreateRequest({
        ...base,
        mention_user_ids: ["u-1"],
        reminder_offsets_minutes: [60],
      });
      expect(req.notify_targets).toEqual({ channel_ids: ["c-1", "c-2"] });
      expect(req.deferred_notifications).toHaveLength(1);
      expect(req.mentions).toEqual([{ user_id: "u-1" }]);
    });
  });
});

/**
 * Update diverged from create when the backend made `deferred_notifications`
 * tri-state (`53d3ba0c`): omitted = unchanged, `[]` = clear, non-empty =
 * replace. Everything else is byte-identical to the create body.
 */
describe("mapDraftToUpdateRequest", () => {
  const base: MaintenanceDraftInput = {
    title: "Patch orders-db",
    description: "Rolling restart",
    planned_start: "2026-08-01T10:00:00Z",
    scope: "resource",
    impact: "partial_outage",
    resource_ids: ["r-1"],
    steps: [{ order: 1, description: "Drain traffic", duration: "1h30m" }],
    approver_user_id: "u-9",
    notify_target_channel_ids: ["c-1"],
  };

  it("matches the create body on every non-tri-state field", () => {
    const withReminders = { ...base, reminder_offsets_minutes: [60] };
    // Strips BOTH tri-state fields: they are the only two whose empty-list
    // meaning diverges between the directions, so they are also the only two the
    // bodies are allowed to differ on. Update types `mentions` as
    // `MentionDto[] | null`, which is why it cannot stay in a
    // `Partial<CreateDraftMaintRequestDto>`.
    const withoutTriState = (
      req: CreateDraftMaintRequestDto | UpdateDraftMaintRequestDto,
    ): Partial<CreateDraftMaintRequestDto> => {
      const copy: Partial<CreateDraftMaintRequestDto> = {
        ...req,
        deferred_notifications: undefined,
        mentions: undefined,
      };
      delete copy.deferred_notifications;
      delete copy.mentions;
      return copy;
    };
    expect(withoutTriState(mapDraftToUpdateRequest(withReminders))).toEqual(
      withoutTriState(mapDraftToCreateRequest(withReminders)),
    );
  });

  it("resolves offsets against planned_start", () => {
    const req = mapDraftToUpdateRequest({ ...base, reminder_offsets_minutes: [24 * 60, 60] });
    expect(req.deferred_notifications).toEqual([
      { fire_at: "2026-07-31T10:00:00.000Z" },
      { fire_at: "2026-08-01T09:00:00.000Z" },
    ]);
  });

  // The load-bearing difference from create. Before the backend fix an empty
  // array meant "unchanged", so unchecking every reminder silently kept them and
  // they still fired; now `[]` clears, and the key MUST be present to say so.
  it("sends an empty array to clear, never omitting the key", () => {
    const req = mapDraftToUpdateRequest({ ...base, reminder_offsets_minutes: [] });
    expect(req).toHaveProperty("deferred_notifications");
    expect(req.deferred_notifications).toEqual([]);
  });

  it("still sends the key when the form carries no reminder field at all", () => {
    const req = mapDraftToUpdateRequest(base);
    expect(req.deferred_notifications).toEqual([]);
  });

  /**
   * Data-loss guard. If `planned_start` won't parse, every offset drops out —
   * and an empty array on update means "clear", so the reminders the operator
   * never touched would be hard-deleted. Omitting the key leaves them alone.
   */
  it("omits the key entirely when no offset can resolve, rather than clearing", () => {
    const req = mapDraftToUpdateRequest({
      ...base,
      planned_start: "",
      reminder_offsets_minutes: [60],
    });
    expect(req).not.toHaveProperty("deferred_notifications");
    expect(JSON.parse(JSON.stringify(req))).not.toHaveProperty("deferred_notifications");
  });

  it("still clears when the operator genuinely selected nothing", () => {
    const req = mapDraftToUpdateRequest({
      ...base,
      planned_start: "",
      reminder_offsets_minutes: [],
    });
    expect(req.deferred_notifications).toEqual([]);
  });

  /**
   * The tri-state trap, stated as the invariant that actually protects the
   * operator: `[]` (clear) and absent (leave unchanged) are DIFFERENT wire
   * messages, and update must never emit the second one. `JSON.stringify` drops
   * an `undefined` value, so serialising is the only assertion that proves the
   * key really reaches the backend.
   */
  it("keeps the key through JSON serialisation, so `[]` reaches the wire as a clear", () => {
    const body = JSON.parse(
      JSON.stringify(mapDraftToUpdateRequest({ ...base, reminder_offsets_minutes: [] })),
    ) as Record<string, unknown>;
    expect(Object.keys(body)).toContain("deferred_notifications");
    expect(body.deferred_notifications).toEqual([]);
  });

  it("never serialises to the 'leave unchanged' shape, whatever the selection", () => {
    for (const offsets of [undefined, [], [60], [1_440, 60]]) {
      const body = JSON.parse(
        JSON.stringify(mapDraftToUpdateRequest({ ...base, reminder_offsets_minutes: offsets })),
      ) as Record<string, unknown>;
      expect(Object.keys(body)).toContain("deferred_notifications");
      expect(body.deferred_notifications).not.toBeNull();
    }
  });

  // Create is the mirror image: an empty selection must NOT serialise the key,
  // or a create body would carry a meaning update reserves for clearing.
  it("create drops the key on serialisation when nothing is selected", () => {
    const body = JSON.parse(
      JSON.stringify(mapDraftToCreateRequest({ ...base, reminder_offsets_minutes: [] })),
    ) as Record<string, unknown>;
    expect(Object.keys(body)).not.toContain("deferred_notifications");
  });

  // The backend replaces wholesale and never merges (SPEC §1.3), so the mapper
  // must emit the complete desired set — a duplicate offset is the operator's
  // stated intent, not something to silently collapse here.
  // The picker already prevents duplicates, but the BFF is its own trust
  // boundary — and hydration keys rows by offset, so a duplicate that got saved
  // would render twice and delete both at once.
  it("collapses duplicate offsets instead of sending the same instant twice", () => {
    const req = mapDraftToUpdateRequest({ ...base, reminder_offsets_minutes: [60, 60] });
    expect(req.deferred_notifications).toEqual([{ fire_at: "2026-08-01T09:00:00.000Z" }]);
  });

  /**
   * RUK-218, AC-07. `mentions` is tri-state on update exactly like
   * `deferred_notifications` — but the trap runs the OPPOSITE way round, because
   * the reminders mapper on create omits the key when the form has none. Copying
   * that pattern here is the bug: the backend reads an absent key as "leave
   * unchanged", so the mentions the operator just removed would stay tagged.
   */
  describe("mentions", () => {
    // THE case. Without the explicit `[]` the removal is silently discarded and
    // the notification still tags people the operator deselected.
    it("sends an empty array to clear, never omitting the key", () => {
      const req = mapDraftToUpdateRequest({ ...base, mention_user_ids: [] });
      expect(req).toHaveProperty("mentions");
      expect(req.mentions).toEqual([]);
    });

    it("still sends the key when the form carries no mention field at all", () => {
      expect(mapDraftToUpdateRequest(base).mentions).toEqual([]);
    });

    it("replaces the whole set with the current selection", () => {
      const req = mapDraftToUpdateRequest({ ...base, mention_user_ids: ["u-1", "u-2"] });
      expect(req.mentions).toEqual([{ user_id: "u-1" }, { user_id: "u-2" }]);
    });

    /**
     * `JSON.stringify` drops an `undefined` value, so serialising is the only
     * assertion that proves the key really reaches the backend as a clear rather
     * than vanishing into the "leave unchanged" reading.
     */
    it("keeps the key through JSON serialisation, so `[]` reaches the wire as a clear", () => {
      const body = JSON.parse(
        JSON.stringify(mapDraftToUpdateRequest({ ...base, mention_user_ids: [] })),
      ) as Record<string, unknown>;
      expect(Object.keys(body)).toContain("mentions");
      expect(body.mentions).toEqual([]);
    });

    it("never serialises to the 'leave unchanged' shape, whatever the selection", () => {
      for (const ids of [undefined, [], ["u-1"], ["u-1", "u-2"]]) {
        const body = JSON.parse(
          JSON.stringify(mapDraftToUpdateRequest({ ...base, mention_user_ids: ids })),
        ) as Record<string, unknown>;
        expect(Object.keys(body)).toContain("mentions");
        expect(body.mentions).not.toBeNull();
      }
    });

    // Create is the mirror image: an empty selection must NOT serialise the key,
    // or a create body would carry a meaning update reserves for clearing.
    it("create drops the key on serialisation when nothing is selected (AC-06)", () => {
      const body = JSON.parse(
        JSON.stringify(mapDraftToCreateRequest({ ...base, mention_user_ids: [] })),
      ) as Record<string, unknown>;
      expect(Object.keys(body)).not.toContain("mentions");
    });

    // Unresolvable reminder offsets omit the key; mentions have no such state
    // (nothing to resolve — the ids go out as-is), so an unparseable start must
    // not accidentally start suppressing them.
    it("is unaffected by a planned_start the reminders cannot resolve against", () => {
      const req = mapDraftToUpdateRequest({
        ...base,
        planned_start: "",
        reminder_offsets_minutes: [60],
        mention_user_ids: ["u-1"],
      });
      expect(req).not.toHaveProperty("deferred_notifications");
      expect(req.mentions).toEqual([{ user_id: "u-1" }]);
    });

    it("collapses duplicate ids the backend would reject", () => {
      const req = mapDraftToUpdateRequest({ ...base, mention_user_ids: ["u-1", "u-1"] });
      expect(req.mentions).toEqual([{ user_id: "u-1" }]);
    });
  });
});

describe("assertValidDraftInput", () => {
  const valid: MaintenanceDraftInput = {
    title: "Patch orders-db",
    planned_start: "2026-06-10T22:00:00Z",
    scope: "resource",
    impact: "partial_outage",
    resource_ids: ["r-1"],
    steps: [{ order: 1, description: "Drain" }],
    notify_target_channel_ids: ["c-1"],
  };

  it("passes a structurally-complete body", () => {
    expect(() => assertValidDraftInput(valid)).not.toThrow();
  });

  it("rejects a non-object body as a 400 BffValidationError", () => {
    expect(() => assertValidDraftInput("nope")).toThrow(BffValidationError);
    expect(() => assertValidDraftInput(null)).toThrow(BffValidationError);
  });

  it("rejects an incomplete body missing steps (the mapper-would-throw case)", () => {
    // This is the exact shape that previously surfaced as 500 BFF_ERROR: the
    // mapper dereferences `steps.map` on an absent array.
    const incomplete: Partial<MaintenanceDraftInput> = { ...valid };
    delete incomplete.steps;
    let caught: unknown;
    try {
      assertValidDraftInput(incomplete);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BffValidationError);
    expect((caught as BffValidationError).fieldErrors).toContainEqual({
      field: "steps",
      message: "steps must be an array",
    });
  });

  it("accepts a body with no reminder offsets", () => {
    expect(() => assertValidDraftInput(valid)).not.toThrow();
    expect(() => assertValidDraftInput({ ...valid, reminder_offsets_minutes: [] })).not.toThrow();
  });

  it("rejects reminder offsets that are not an array", () => {
    let caught: unknown;
    try {
      assertValidDraftInput({ ...valid, reminder_offsets_minutes: 60 });
    } catch (error) {
      caught = error;
    }
    expect((caught as BffValidationError).fieldErrors).toContainEqual({
      field: "reminder_offsets_minutes",
      message: "reminder_offsets_minutes must be an array",
    });
  });

  it("rejects more reminders than the backend cap", () => {
    const eleven = Array.from({ length: 11 }, (_, i) => (i + 1) * 15);
    let caught: unknown;
    try {
      assertValidDraftInput({ ...valid, reminder_offsets_minutes: eleven });
    } catch (error) {
      caught = error;
    }
    expect((caught as BffValidationError).fieldErrors).toContainEqual({
      field: "reminder_offsets_minutes",
      message: "At most 10 reminders.",
    });
    expect(() =>
      assertValidDraftInput({ ...valid, reminder_offsets_minutes: eleven.slice(0, 10) }),
    ).not.toThrow();
  });

  it("rejects non-positive or non-numeric reminder offsets", () => {
    for (const bad of [[0], [-15], ["60"], [Number.NaN]]) {
      expect(() => assertValidDraftInput({ ...valid, reminder_offsets_minutes: bad })).toThrow(
        BffValidationError,
      );
    }
  });

  // RUK-218. Structural only, and deliberately direction-agnostic: this guard is
  // shared by the create and the edit route, so "empty means clear vs unchanged"
  // is not its business — that lives in the two mappers, exactly as it does for
  // the reminder offsets above.
  it("accepts a body with no mentions, an empty list, or a full one", () => {
    expect(() => assertValidDraftInput(valid)).not.toThrow();
    expect(() => assertValidDraftInput({ ...valid, mention_user_ids: [] })).not.toThrow();
    expect(() => assertValidDraftInput({ ...valid, mention_user_ids: ["u-1", "u-2"] })).not.toThrow();
  });

  it("rejects mention ids that are not an array", () => {
    let caught: unknown;
    try {
      assertValidDraftInput({ ...valid, mention_user_ids: "u-1" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BffValidationError);
    expect((caught as BffValidationError).fieldErrors).toContainEqual({
      field: "mention_user_ids",
      message: "mention_user_ids must be an array",
    });
  });

  it("rejects more mentions than the backend cap", () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `u-${i + 1}`);
    let caught: unknown;
    try {
      assertValidDraftInput({ ...valid, mention_user_ids: eleven });
    } catch (error) {
      caught = error;
    }
    expect((caught as BffValidationError).fieldErrors).toContainEqual({
      field: "mention_user_ids",
      message: "At most 10 mentions.",
    });
    // The cap is inclusive.
    expect(() => assertValidDraftInput({ ...valid, mention_user_ids: eleven.slice(0, 10) })).not.toThrow();
  });

  it("rejects blank or non-string mention ids", () => {
    for (const bad of [[""], ["  "], [42], [null], ["u-1", ""]]) {
      expect(() => assertValidDraftInput({ ...valid, mention_user_ids: bad })).toThrow(BffValidationError);
    }
  });

  it("requires resource_ids only for resource scope", () => {
    const withoutIds: Partial<MaintenanceDraftInput> = { ...valid };
    delete withoutIds.resource_ids;
    expect(() => assertValidDraftInput({ ...withoutIds, scope: "global" })).not.toThrow();
    expect(() => assertValidDraftInput({ ...withoutIds, scope: "resource" })).toThrow(BffValidationError);
  });

  it("rejects a missing/invalid scope, title, planned_start, and notify targets", () => {
    let caught: unknown;
    try {
      assertValidDraftInput({ scope: "weird" });
    } catch (error) {
      caught = error;
    }
    const fields = (caught as BffValidationError).fieldErrors.map((f) => f.field);
    expect(fields).toEqual(
      expect.arrayContaining(["title", "planned_start", "scope", "steps", "notify_target_channel_ids"]),
    );
  });
});

describe("parseDraftBody", () => {
  const validJson = JSON.stringify({
    title: "Patch orders-db",
    planned_start: "2026-06-10T22:00:00Z",
    scope: "global",
    impact: "none",
    resource_ids: [],
    steps: [{ order: 1, description: "Drain" }],
    notify_target_channel_ids: ["c-1"],
  });

  it("parses and returns a valid body", () => {
    const input = parseDraftBody(validJson);
    expect(input.title).toBe("Patch orders-db");
  });

  it("maps malformed JSON to a 400 BffValidationError, not a thrown SyntaxError", () => {
    let caught: unknown;
    try {
      parseDraftBody("{ not json");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BffValidationError);
    expect((caught as BffValidationError).fieldErrors).toContainEqual({
      field: "body",
      message: "Request body is not valid JSON",
    });
  });

  it("maps a structurally-incomplete body to a 400 BffValidationError", () => {
    expect(() => parseDraftBody(JSON.stringify({ title: "x" }))).toThrow(BffValidationError);
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

  /**
   * RUK-218, AC-11. `has_messenger_tag` is tri-state and must stay that way: a
   * `?? false` would fuse "the backend checked and found no messenger handle"
   * with "nobody told us", and the picker would warn about an unreachable mention
   * on data it never had (guest context, or a backend predating the flag).
   */
  describe("has_messenger_tag", () => {
    it("stays undefined — NOT false — when the backend omits the field", () => {
      const user = mapAssignableUser({ id: "u-1", display_name: "Ada" });
      expect(user.has_messenger_tag).toBeUndefined();
      expect(user.has_messenger_tag).not.toBe(false);
    });

    it("carries true through", () => {
      expect(mapAssignableUser({ id: "u-1", has_messenger_tag: true }).has_messenger_tag).toBe(true);
    });

    it("carries false through as its own answer", () => {
      const user = mapAssignableUser({ id: "u-1", has_messenger_tag: false });
      expect(user.has_messenger_tag).toBe(false);
      expect(user.has_messenger_tag).not.toBeUndefined();
    });
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
