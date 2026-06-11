import { describe, expect, it } from "vitest";

import type {
  Maintenance,
  MaintenanceScope,
  MaintenanceStatus,
} from "@/domain/maintenance/maintenance";

import {
  applyCalendarFilters,
  defaultFilterState,
  matchesFilters,
  resourceOptions,
  upcomingItems,
  type CalendarFilterState,
} from "../calendar-filters";

const iso = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(y, m - 1, d, h, min, 0).toISOString();

function mk(
  id: string,
  opts: {
    status?: MaintenanceStatus;
    scope?: MaintenanceScope;
    resources?: { id: string; name: string; type?: string }[];
    start?: string;
    end?: string;
  } = {},
): Maintenance {
  const start = opts.start ?? iso(2026, 6, 8, 10);
  const end = opts.end ?? iso(2026, 6, 8, 12);
  return {
    id,
    title: id,
    status: opts.status ?? "planned",
    impact: "none",
    scope: opts.scope ?? "global",
    planned_period: { start, end },
    resources: opts.resources ?? [],
    notify_targets: [],
    steps: [],
    created_at: start,
    updated_at: start,
  };
}

describe("defaultFilterState", () => {
  it("activates Planned + In progress, scope all, no resources", () => {
    const f = defaultFilterState();
    expect([...f.statuses].sort()).toEqual(["in_progress", "planned"]);
    expect(f.scope).toBe("all");
    expect(f.resourceIds.size).toBe(0);
  });
});

describe("matchesFilters", () => {
  const base = (over: Partial<CalendarFilterState> = {}): CalendarFilterState => ({
    statuses: new Set<MaintenanceStatus>(["planned", "in_progress"]),
    scope: "all",
    resourceIds: new Set<string>(),
    ...over,
  });

  it("hides a status not in the active set", () => {
    expect(matchesFilters(mk("a", { status: "draft" }), base())).toBe(false);
    expect(matchesFilters(mk("b", { status: "planned" }), base())).toBe(true);
  });

  it("restricts by scope when not 'all'", () => {
    const f = base({ scope: "resource" });
    expect(matchesFilters(mk("a", { scope: "global" }), f)).toBe(false);
    expect(matchesFilters(mk("b", { scope: "resource" }), f)).toBe(true);
  });

  it("requires resource intersection only when resourceIds is non-empty", () => {
    const withResource = mk("a", { resources: [{ id: "r-1", name: "db" }] });
    const noResource = mk("b", { resources: [] });
    expect(matchesFilters(withResource, base())).toBe(true);
    expect(matchesFilters(noResource, base())).toBe(true);

    const f = base({ resourceIds: new Set(["r-1"]) });
    expect(matchesFilters(withResource, f)).toBe(true);
    expect(matchesFilters(noResource, f)).toBe(false);
  });
});

describe("applyCalendarFilters", () => {
  it("filters the list with the default state (Planned + In progress only)", () => {
    const items = [
      mk("p", { status: "planned" }),
      mk("ip", { status: "in_progress" }),
      mk("d", { status: "draft" }),
      mk("c", { status: "completed" }),
    ];
    const out = applyCalendarFilters(items, defaultFilterState());
    expect(out.map((m) => m.id)).toEqual(["p", "ip"]);
  });
});

describe("resourceOptions", () => {
  it("returns distinct resources sorted by name", () => {
    const items = [
      mk("a", { resources: [{ id: "r-2", name: "redis" }, { id: "r-1", name: "api" }] }),
      mk("b", { resources: [{ id: "r-1", name: "api" }] }),
    ];
    expect(resourceOptions(items).map((r) => r.id)).toEqual(["r-1", "r-2"]);
  });
});

describe("upcomingItems", () => {
  const now = new Date(2026, 5, 8, 11, 0); // 2026-06-08 11:00 local

  it("leads with in_progress, then planned by start, excludes past/draft/completed", () => {
    const items = [
      mk("future2", { status: "planned", start: iso(2026, 6, 8, 18), end: iso(2026, 6, 8, 19) }),
      mk("running", {
        status: "in_progress",
        start: iso(2026, 6, 8, 10),
        end: iso(2026, 6, 8, 12),
      }),
      mk("future1", { status: "planned", start: iso(2026, 6, 8, 14), end: iso(2026, 6, 8, 15) }),
      mk("past", { status: "planned", start: iso(2026, 6, 8, 7), end: iso(2026, 6, 8, 8) }),
      mk("draft", { status: "draft", start: iso(2026, 6, 8, 20), end: iso(2026, 6, 8, 21) }),
    ];
    const out = upcomingItems(items, now);
    expect(out.map((m) => m.id)).toEqual(["running", "future1", "future2"]);
  });

  it("respects the limit", () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      mk(`p${i}`, { status: "planned", start: iso(2026, 6, 8, 12 + i), end: iso(2026, 6, 8, 13 + i) }),
    );
    expect(upcomingItems(items, now, 3)).toHaveLength(3);
  });
});
