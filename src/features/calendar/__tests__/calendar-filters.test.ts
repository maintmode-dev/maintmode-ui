import { describe, expect, it } from "vitest";

import type { CalendarEvent, MaintenanceScope, MaintenanceStatus } from "@/domain/maintenance/maintenance";

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
): CalendarEvent {
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

  it("ignores status — the server filters by status, not the client predicate", () => {
    // A status outside the active set still passes the CLIENT filter: the
    // backend already excluded unwanted statuses, so re-checking here would
    // double-filter. Scope/resource are the only client dimensions.
    expect(matchesFilters(mk("a", { status: "draft" }), base())).toBe(true);
    expect(matchesFilters(mk("c", { status: "canceled" }), base())).toBe(true);
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
  it("keeps all statuses (status is server-filtered, not applied here)", () => {
    // The page hands `applyCalendarFilters` an already status-filtered `items`,
    // so the client predicate must NOT drop rows by status — with default state
    // (scope all, no resources) everything passes through unchanged.
    const items = [
      mk("p", { status: "planned" }),
      mk("ip", { status: "in_progress" }),
      mk("d", { status: "draft" }),
      mk("c", { status: "completed" }),
    ];
    const out = applyCalendarFilters(items, defaultFilterState());
    expect(out.map((m) => m.id)).toEqual(["p", "ip", "d", "c"]);
  });

  it("still narrows by scope + resource", () => {
    const items = [
      mk("g", { scope: "global" }),
      mk("r", { scope: "resource", resources: [{ id: "r-1", name: "db" }] }),
    ];
    const f: CalendarFilterState = {
      statuses: new Set<MaintenanceStatus>(["planned"]),
      scope: "resource",
      resourceIds: new Set<string>(),
    };
    expect(applyCalendarFilters(items, f).map((m) => m.id)).toEqual(["r"]);
  });
});

describe("resourceOptions", () => {
  it("returns distinct resources sorted by name", () => {
    const items = [
      mk("a", {
        resources: [
          { id: "r-2", name: "redis" },
          { id: "r-1", name: "api" },
        ],
      }),
      mk("b", { resources: [{ id: "r-1", name: "api" }] }),
    ];
    expect(resourceOptions(items).map((r) => r.id)).toEqual(["r-1", "r-2"]);
  });
});

describe("upcomingItems", () => {
  // UTC throughout (the day-boundary logic is UTC). now = 2026-06-08 11:00Z.
  const utc = (y: number, mo: number, d: number, h: number, mi = 0) =>
    new Date(Date.UTC(y, mo - 1, d, h, mi)).toISOString();
  const now = new Date(Date.UTC(2026, 5, 8, 11, 0));

  it("leads with in_progress, then planned by start; excludes draft/completed/canceled", () => {
    const items = [
      mk("future2", { status: "planned", start: utc(2026, 6, 8, 18), end: utc(2026, 6, 8, 19) }),
      mk("running", { status: "in_progress", start: utc(2026, 6, 8, 10), end: utc(2026, 6, 8, 12) }),
      mk("future1", { status: "planned", start: utc(2026, 6, 8, 14), end: utc(2026, 6, 8, 15) }),
      mk("draft", { status: "draft", start: utc(2026, 6, 8, 20), end: utc(2026, 6, 8, 21) }),
      mk("done", { status: "completed", start: utc(2026, 6, 8, 9), end: utc(2026, 6, 8, 10) }),
    ];
    const out = upcomingItems(items, now);
    expect(out.map((m) => m.id)).toEqual(["running", "future1", "future2"]);
  });

  it("includes a maintenance that STARTS tomorrow (UTC)", () => {
    const items = [mk("tomorrow", { status: "planned", start: utc(2026, 6, 9, 8), end: utc(2026, 6, 9, 9) })];
    expect(upcomingItems(items, now).map((m) => m.id)).toEqual(["tomorrow"]);
  });

  it("excludes a planned maintenance that starts the day AFTER tomorrow", () => {
    const items = [
      mk("twoDays", { status: "planned", start: utc(2026, 6, 10, 8), end: utc(2026, 6, 10, 9) }),
    ];
    expect(upcomingItems(items, now)).toHaveLength(0);
  });

  it("includes a still-running multi-day window that started yesterday", () => {
    // Started yesterday, ends tomorrow → running now, so it qualifies even though
    // its start is not today/tomorrow.
    const items = [
      mk("longRun", { status: "in_progress", start: utc(2026, 6, 7, 9), end: utc(2026, 6, 9, 9) }),
    ];
    expect(upcomingItems(items, now).map((m) => m.id)).toEqual(["longRun"]);
  });

  it("excludes an in_progress item whose window is entirely in the past (overdue, not 'up next')", () => {
    // Stuck in_progress: planned end was 2h ago and it didn't start today/tomorrow.
    const items = [
      mk("overdue", { status: "in_progress", start: utc(2026, 6, 7, 5), end: utc(2026, 6, 7, 6) }),
    ];
    expect(upcomingItems(items, now)).toHaveLength(0);
  });

  // ── Boundary cases: pin the exact comparison operators ──

  it("includes a start at exactly today 00:00:00Z (inclusive lower bound)", () => {
    // start === startOfDay(now) exercises `start >= today`.
    const items = [mk("midnight", { status: "planned", start: utc(2026, 6, 8, 0), end: utc(2026, 6, 8, 1) })];
    expect(upcomingItems(items, now).map((m) => m.id)).toEqual(["midnight"]);
  });

  it("excludes a start at exactly day-after-tomorrow 00:00:00Z (exclusive upper bound)", () => {
    // start === today + 2d exercises `start < dayAfterTomorrow` (must be excluded).
    const items = [mk("edge", { status: "planned", start: utc(2026, 6, 10, 0), end: utc(2026, 6, 10, 1) })];
    expect(upcomingItems(items, now)).toHaveLength(0);
  });

  it("includes a running window whose end is exactly now (inclusive `now <= end`)", () => {
    // start in the past (yesterday, so not today/tomorrow), end === now → only the
    // running-now branch can keep it. Proves the `<=` edge, not `<`.
    const items = [
      mk("endsNow", { status: "in_progress", start: utc(2026, 6, 7, 9), end: utc(2026, 6, 8, 11) }),
    ];
    expect(upcomingItems(items, now).map((m) => m.id)).toEqual(["endsNow"]);
  });

  it("includes an in_progress that starts tomorrow but is not yet running", () => {
    // Confirms the in_progress branch flows through the today/tomorrow start window,
    // not only the running-now branch.
    const items = [
      mk("ipTom", { status: "in_progress", start: utc(2026, 6, 9, 8), end: utc(2026, 6, 9, 9) }),
    ];
    expect(upcomingItems(items, now).map((m) => m.id)).toEqual(["ipTom"]);
  });

  it("skips a malformed-date row without throwing", () => {
    const items = [
      mk("bad", { status: "planned", start: "not-a-date", end: "also-bad" }),
      mk("good", { status: "planned", start: utc(2026, 6, 8, 14), end: utc(2026, 6, 8, 15) }),
    ];
    expect(upcomingItems(items, now).map((m) => m.id)).toEqual(["good"]);
  });

  it("respects the limit", () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      mk(`p${i}`, {
        status: "planned",
        start: utc(2026, 6, 8, 12 + (i % 6)),
        end: utc(2026, 6, 8, 13 + (i % 6)),
      }),
    );
    expect(upcomingItems(items, now, 3)).toHaveLength(3);
  });
});
