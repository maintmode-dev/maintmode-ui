import { describe, expect, it } from "vitest";

import type { CalendarFilterState } from "@/features/calendar/lib/calendar-navigation";
import { calendarQueryKeys, resolveCalendarRange } from "@/features/calendar/queries/query-keys";

function makeState(overrides: Partial<CalendarFilterState> = {}): CalendarFilterState {
  return {
    view: "month",
    date: "2026-05-15",
    scope: "all",
    statuses: [],
    resourceIds: [],
    ...overrides,
  };
}

describe("calendarQueryKeys.list", () => {
  it("keys by resolved {from,to} range, not state.date, so intra-month navigation hits cache", () => {
    const earlyMay = calendarQueryKeys.list(makeState({ date: "2026-05-01" }));
    const lateMay = calendarQueryKeys.list(makeState({ date: "2026-05-31" }));
    // Both anchors land in the same month grid (Mon..Sun) → same cache key.
    expect(earlyMay).toEqual(lateMay);
  });

  it("changes when view changes (day vs week vs month)", () => {
    const day = calendarQueryKeys.list(makeState({ view: "day" }));
    const week = calendarQueryKeys.list(makeState({ view: "week" }));
    const month = calendarQueryKeys.list(makeState({ view: "month" }));
    expect(day).not.toEqual(week);
    expect(week).not.toEqual(month);
  });

  it("normalizes statuses ordering so the same set produces the same key", () => {
    const a = calendarQueryKeys.list(makeState({ statuses: ["planned", "completed"] }));
    const b = calendarQueryKeys.list(makeState({ statuses: ["completed", "planned"] }));
    expect(a).toEqual(b);
  });

  it("normalizes resourceIds ordering so the same set produces the same key", () => {
    const a = calendarQueryKeys.list(makeState({ resourceIds: ["r2", "r1"] }));
    const b = calendarQueryKeys.list(makeState({ resourceIds: ["r1", "r2"] }));
    expect(a).toEqual(b);
  });
});

describe("resolveCalendarRange", () => {
  it("falls back to today when date is unparseable", () => {
    const result = resolveCalendarRange(makeState({ date: "not-a-date" }));
    expect(result.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns the same date twice for day view", () => {
    const result = resolveCalendarRange(makeState({ view: "day", date: "2026-05-15" }));
    expect(result).toEqual({ from: "2026-05-15", to: "2026-05-15" });
  });
});
