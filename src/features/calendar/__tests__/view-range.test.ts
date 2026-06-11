import { describe, expect, it } from "vitest";

import {
  anchorFor,
  anchorOnViewSwitch,
  periodTitle,
  startOfWeek,
  stepAnchor,
  toDateParam,
  viewRange,
} from "../view-range";

// Wed 2026-06-10 (months are 0-indexed). Monday of that week is Jun 8.
const wed = new Date(2026, 5, 10, 13, 30, 0);

describe("anchorOnViewSwitch", () => {
  // today = Wed Jun 10; the week containing it is Jun 8–14, the month is June.
  const today = wed;

  it("lands on today when switching Week → Day and today is in the visible week", () => {
    const weekAnchor = anchorFor("week", today); // Mon Jun 8
    const a = anchorOnViewSwitch("week", "day", weekAnchor, today);
    expect(a.getDate()).toBe(10); // today, not Jun 8
    expect(a.getHours()).toBe(0);
  });

  it("lands on today when switching Month → Day and today is in the visible month", () => {
    const monthAnchor = anchorFor("month", today); // Jun 1
    const a = anchorOnViewSwitch("month", "day", monthAnchor, today);
    expect(a.getDate()).toBe(10);
    expect(a.getMonth()).toBe(5);
  });

  it("keeps the period's first day when switching Week → Day and today is OUT of view", () => {
    const awayWeek = anchorFor("week", new Date(2026, 6, 6)); // Mon Jul 6 (different week)
    const a = anchorOnViewSwitch("week", "day", awayWeek, today);
    expect(a.getDate()).toBe(6); // first day of the away-week, NOT today
    expect(a.getMonth()).toBe(6); // July
  });

  it("keeps the month's first day when switching Month → Day and today is OUT of view", () => {
    const awayMonth = anchorFor("month", new Date(2026, 8, 15)); // Sep 1
    const a = anchorOnViewSwitch("month", "day", awayMonth, today);
    // Sep grid's first visible day is the Monday on/before Sep 1 → Aug 31.
    expect(anchorFor("month", a).getMonth()).not.toBe(5); // not June (today's month)
  });

  it("falls back to the generic snap for non-Day targets (Day → Week)", () => {
    const dayAnchor = anchorFor("day", today);
    const a = anchorOnViewSwitch("day", "week", dayAnchor, today);
    expect(a.getDate()).toBe(8); // Monday of the week — same as anchorFor
  });
});

describe("anchorFor", () => {
  it("snaps day to local midnight", () => {
    const a = anchorFor("day", wed);
    expect(a.getHours()).toBe(0);
    expect(a.getDate()).toBe(10);
  });
  it("snaps week to the Monday", () => {
    expect(anchorFor("week", wed).getDate()).toBe(8); // Mon Jun 8
  });
  it("snaps month to the 1st", () => {
    const a = anchorFor("month", wed);
    expect(a.getDate()).toBe(1);
    expect(a.getMonth()).toBe(5); // June
  });
});

describe("stepAnchor cadence", () => {
  it("steps the day view by ±1 day", () => {
    expect(stepAnchor("day", anchorFor("day", wed), 1).getDate()).toBe(11);
    expect(stepAnchor("day", anchorFor("day", wed), -1).getDate()).toBe(9);
  });
  it("steps the week view by ±7 days", () => {
    const mon = anchorFor("week", wed); // Jun 8
    expect(toDateParam(stepAnchor("week", mon, 1))).toBe("2026-06-15");
    expect(toDateParam(stepAnchor("week", mon, -1))).toBe("2026-06-01");
  });
  it("steps the month view by ±1 month", () => {
    const first = anchorFor("month", wed); // Jun 1
    expect(stepAnchor("month", first, 1).getMonth()).toBe(6); // Jul
    expect(stepAnchor("month", first, -1).getMonth()).toBe(4); // May
  });
});

describe("viewRange", () => {
  it("day range is a single inclusive day", () => {
    const { from, to } = viewRange("day", anchorFor("day", wed));
    expect(toDateParam(from)).toBe("2026-06-10");
    expect(toDateParam(to)).toBe("2026-06-10");
  });
  it("week range spans Mon..Sun (7 inclusive days)", () => {
    const { from, to } = viewRange("week", anchorFor("week", wed));
    expect(toDateParam(from)).toBe("2026-06-08");
    expect(toDateParam(to)).toBe("2026-06-14");
  });
  it("month range covers the full 6-week grid (Monday before the 1st)", () => {
    const { from, to } = viewRange("month", anchorFor("month", wed));
    // June 1 2026 is a Monday, so the grid starts on June 1 and runs 42 days.
    expect(toDateParam(from)).toBe("2026-06-01");
    expect(toDateParam(to)).toBe("2026-07-12");
  });
});

describe("periodTitle formatting", () => {
  it("day → weekday + date", () => {
    expect(periodTitle("day", anchorFor("day", wed))).toBe("Wed Jun 10, 2026");
  });
  it("week → range, collapsing the month when within one", () => {
    expect(periodTitle("week", anchorFor("week", wed))).toBe("Jun 8 — 14, 2026");
  });
  it("week → spans the month name across a boundary", () => {
    // Week of Mon 2026-06-29 runs into July.
    const lateJune = startOfWeek(new Date(2026, 5, 29));
    expect(periodTitle("week", lateJune)).toBe("Jun 29 — Jul 5, 2026");
  });
  it("month → month + year", () => {
    expect(periodTitle("month", anchorFor("month", wed))).toBe("Jun 2026");
  });

  it("day → appends ` · HH:mm UTC` when a now clock is passed", () => {
    // 2026-06-10T09:05:00Z → 09:05 UTC regardless of the runner's timezone.
    const nowUtc = new Date("2026-06-10T09:05:00Z");
    expect(periodTitle("day", anchorFor("day", wed), nowUtc)).toBe("Wed Jun 10, 2026 · 09:05 UTC");
  });

  it("day → omits the clock suffix when no now is passed", () => {
    expect(periodTitle("day", anchorFor("day", wed))).toBe("Wed Jun 10, 2026");
  });
});
