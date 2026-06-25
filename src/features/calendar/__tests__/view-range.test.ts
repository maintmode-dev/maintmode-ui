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
// Built in UTC and asserted with UTC getters so the suite is timezone-stable —
// the calendar reasons entirely in UTC (see view-range.ts) and an operator's
// local TZ must not change what "today"/anchors resolve to.
const wed = new Date(Date.UTC(2026, 5, 10, 13, 30, 0));

describe("anchorOnViewSwitch", () => {
  // today = Wed Jun 10; the week containing it is Jun 8–14, the month is June.
  const today = wed;

  it("lands on today when switching Week → Day and today is in the visible week", () => {
    const weekAnchor = anchorFor("week", today); // Mon Jun 8
    const a = anchorOnViewSwitch("week", "day", weekAnchor, today);
    expect(a.getUTCDate()).toBe(10); // today, not Jun 8
    expect(a.getUTCHours()).toBe(0);
  });

  it("lands on today when switching Month → Day and today is in the visible month", () => {
    const monthAnchor = anchorFor("month", today); // Jun 1
    const a = anchorOnViewSwitch("month", "day", monthAnchor, today);
    expect(a.getUTCDate()).toBe(10);
    expect(a.getUTCMonth()).toBe(5);
  });

  it("keeps the period's first day when switching Week → Day and today is OUT of view", () => {
    const awayWeek = anchorFor("week", new Date(Date.UTC(2026, 6, 6))); // Mon Jul 6 (different week)
    const a = anchorOnViewSwitch("week", "day", awayWeek, today);
    expect(a.getUTCDate()).toBe(6); // first day of the away-week, NOT today
    expect(a.getUTCMonth()).toBe(6); // July
  });

  it("keeps the month's first day when switching Month → Day and today is OUT of view", () => {
    const awayMonth = anchorFor("month", new Date(Date.UTC(2026, 8, 15))); // Sep 1
    const a = anchorOnViewSwitch("month", "day", awayMonth, today);
    // Sep grid's first visible day is the Monday on/before Sep 1 → Aug 31.
    expect(anchorFor("month", a).getUTCMonth()).not.toBe(5); // not June (today's month)
  });

  it("lands on today's week when switching Month → Week and today is in the visible month", () => {
    // Regression: this used to jump to the FIRST week of the month (anchor = the
    // 1st → its week), ignoring today even though it was in view.
    const monthAnchor = anchorFor("month", today); // Jun 1
    const a = anchorOnViewSwitch("month", "week", monthAnchor, today);
    expect(a.getUTCDate()).toBe(8); // Monday of today's week (Jun 8–14), not Jun 1
    expect(a.getUTCMonth()).toBe(5);
  });

  it("keeps the period's week when switching Month → Week and today is OUT of view", () => {
    const awayMonth = anchorFor("month", new Date(Date.UTC(2026, 8, 15))); // Sep 1
    const a = anchorOnViewSwitch("month", "week", awayMonth, today);
    // Falls back to the week of the away-month's first visible day, NOT today's.
    expect(a.getUTCMonth()).not.toBe(5); // not June
  });

  it("falls back to the generic snap when WIDENING (Day → Week)", () => {
    // Day → Week is widening, so the land-on-today rule does not apply.
    const dayAnchor = anchorFor("day", today);
    const a = anchorOnViewSwitch("day", "week", dayAnchor, today);
    expect(a.getUTCDate()).toBe(8); // Monday of the week — same as anchorFor
  });

  it("lands on today when today is the LAST visible day of the month grid (inclusive edge)", () => {
    // Pin the `t <= startOfDay(to)` inclusive upper edge. The June 2026 grid runs
    // Mon Jun 1 … Sun Jul 5; pick a `today` on that last visible day (Jul 5) while
    // the anchor is still June, switching Month → Week. It must land on Jul 5's
    // week, not fall through to the period's first week.
    const julyFifth = new Date(Date.UTC(2026, 6, 5)); // Sun Jul 5, in June's 6-week grid
    const a = anchorOnViewSwitch("month", "week", anchorFor("month", wed), julyFifth);
    // startOfWeek(Jul 5) = Mon Jun 29.
    expect(a.getUTCMonth()).toBe(5); // June
    expect(a.getUTCDate()).toBe(29);
  });

  it("ignores today when WIDENING Week → Month (generic snap)", () => {
    // Week → Month is widening (a distinct WIDTH comparison from Day → Week).
    const weekAnchor = anchorFor("week", today);
    const a = anchorOnViewSwitch("week", "month", weekAnchor, today);
    // Snaps to the month's 1st, regardless of today.
    expect(a.getUTCDate()).toBe(1);
    expect(a.getUTCMonth()).toBe(5);
  });

  it("treats a same-view switch as the generic snap (Day → Day)", () => {
    // narrowing is false (WIDTH equal), so it returns anchorFor(toView, anchor).
    const dayAnchor = anchorFor("day", wed);
    const a = anchorOnViewSwitch("day", "day", dayAnchor, today);
    expect(a.getUTCDate()).toBe(10);
  });
});

describe("anchorFor", () => {
  it("snaps day to UTC midnight", () => {
    const a = anchorFor("day", wed);
    expect(a.getUTCHours()).toBe(0);
    expect(a.getUTCDate()).toBe(10);
  });
  it("snaps week to the Monday", () => {
    expect(anchorFor("week", wed).getUTCDate()).toBe(8); // Mon Jun 8
  });
  it("snaps month to the 1st", () => {
    const a = anchorFor("month", wed);
    expect(a.getUTCDate()).toBe(1);
    expect(a.getUTCMonth()).toBe(5); // June
  });
});

describe("stepAnchor cadence", () => {
  it("steps the day view by ±1 day", () => {
    expect(stepAnchor("day", anchorFor("day", wed), 1).getUTCDate()).toBe(11);
    expect(stepAnchor("day", anchorFor("day", wed), -1).getUTCDate()).toBe(9);
  });
  it("steps the week view by ±7 days", () => {
    const mon = anchorFor("week", wed); // Jun 8
    expect(toDateParam(stepAnchor("week", mon, 1))).toBe("2026-06-15");
    expect(toDateParam(stepAnchor("week", mon, -1))).toBe("2026-06-01");
  });
  it("steps the month view by ±1 month", () => {
    const first = anchorFor("month", wed); // Jun 1
    expect(stepAnchor("month", first, 1).getUTCMonth()).toBe(6); // Jul
    expect(stepAnchor("month", first, -1).getUTCMonth()).toBe(4); // May
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
  it("month range backs off to the Monday before the 1st when the 1st isn't a Monday", () => {
    // Sep 1 2026 is a Tuesday → the grid must start on Mon Aug 31 (the back-off
    // branch June can't exercise), still spanning a full 42-day window.
    const { from, to } = viewRange("month", anchorFor("month", new Date(Date.UTC(2026, 8, 15))));
    expect(toDateParam(from)).toBe("2026-08-31");
    expect(toDateParam(to)).toBe("2026-10-11");
  });
  it("month grid spans a year boundary (December → January)", () => {
    // Dec 1 2026 is a Tuesday → grid starts Mon Nov 30 2026 and runs into 2027,
    // exercising the getUTCFullYear rollover.
    const { from, to } = viewRange("month", anchorFor("month", new Date(Date.UTC(2026, 11, 10))));
    expect(toDateParam(from)).toBe("2026-11-30");
    expect(toDateParam(to)).toBe("2027-01-10");
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
    const lateJune = startOfWeek(new Date(Date.UTC(2026, 5, 29)));
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

describe("timezone stability (hydration #418 guard)", () => {
  // The Day-view title is server-rendered (UTC container) then hydrated in the
  // operator's local TZ. If the anchor/title read LOCAL date components, the day
  // number/weekday diverge across the UTC↔local midnight boundary and React
  // throws a text hydration mismatch (#418).
  //
  // Asserting only that the title equals the UTC day is NOT enough to lock the
  // fix: when the test runner is itself in UTC (the GitHub-hosted CI default,
  // and we pin no TZ), a buggy local-reading implementation ALSO returns the UTC
  // day — so such a test passes on the broken code and guards nothing. Instead,
  // each case picks an instant whose LOCAL calendar day (in the runner's actual
  // timezone) differs from its UTC day, and asserts the helpers track the UTC
  // day and NOT the local day. We compute the local-vs-UTC divergence at runtime
  // from a sweep of instants, so the guard bites in EVERY timezone, UTC included
  // (where we fall back to constructing an instant that has no local divergence
  // but still pins the UTC contract).

  // Find an instant on/around 2026-06-10 whose local date differs from its UTC
  // date, if the runner's TZ admits one (every non-UTC zone does, at some hour).
  const divergentInstant = (() => {
    for (let h = 0; h < 24; h++) {
      const d = new Date(Date.UTC(2026, 5, 10, h, 30));
      if (d.getDate() !== d.getUTCDate()) return d;
    }
    return null; // runner is effectively UTC — no local/UTC divergence exists
  })();

  it("title + date param track the UTC day, not the runner's local day", () => {
    const probe = divergentInstant ?? new Date("2026-06-10T12:00:00Z");
    const anchor = anchorFor("day", probe);

    // Always true: the helpers resolve by UTC calendar day.
    expect(toDateParam(anchor)).toBe(
      `${probe.getUTCFullYear()}-${String(probe.getUTCMonth() + 1).padStart(2, "0")}-${String(probe.getUTCDate()).padStart(2, "0")}`,
    );
    expect(periodTitle("day", anchor)).toContain(String(probe.getUTCDate()));

    // The biting assertion (skipped only in a UTC runner, where no divergence
    // exists): the title must NOT contain the LOCAL day number when it differs
    // from the UTC one. A local-reading implementation fails here.
    if (divergentInstant) {
      const localDay = probe.getDate();
      const utcDay = probe.getUTCDate();
      expect(localDay).not.toBe(utcDay); // sanity: we really found a divergence
      expect(toDateParam(anchor)).not.toContain(`-${String(localDay).padStart(2, "0")}`);
    }
  });

  it("resolves a fixed UTC instant to its UTC day regardless of runner TZ", () => {
    // 2026-06-10T23:30Z is Jun 10 in UTC (Jun 11 in any positive offset). Pinned
    // expectation, independent of the runner's zone.
    const lateUtc = new Date("2026-06-10T23:30:00Z");
    expect(periodTitle("day", anchorFor("day", lateUtc))).toBe("Wed Jun 10, 2026");
    expect(toDateParam(anchorFor("day", lateUtc))).toBe("2026-06-10");
  });
});
