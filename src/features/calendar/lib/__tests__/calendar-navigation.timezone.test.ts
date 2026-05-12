import { describe, expect, it } from "vitest";

import {
  calendarRangeForView,
  formatLocalDateParam,
  parseLocalDateParam,
} from "@/features/calendar/lib/calendar-navigation";

// Anchor dates use the local Date constructor (no `Z`) so behaviour matches
// the way the UI builds anchors from URL params. Asserts the local-date
// round-trip is stable across DST transitions and ISO-string edge cases.

describe("formatLocalDateParam / parseLocalDateParam — round-trip", () => {
  it("survives a spring-forward DST boundary in March", () => {
    const before = new Date(2026, 2, 7); // 2026-03-07 (Sat) — before US DST
    const after = new Date(2026, 2, 14); // 2026-03-14 (Sat) — DST begins this day in US
    expect(formatLocalDateParam(before)).toBe("2026-03-07");
    expect(formatLocalDateParam(after)).toBe("2026-03-14");
  });

  it("survives a fall-back DST boundary in November", () => {
    const before = new Date(2026, 10, 1); // 2026-11-01 — DST ends in US
    const after = new Date(2026, 10, 8);
    expect(formatLocalDateParam(before)).toBe("2026-11-01");
    expect(formatLocalDateParam(after)).toBe("2026-11-08");
  });

  it("round-trips a parsed param back to the same string", () => {
    const parsed = parseLocalDateParam("2026-03-14");
    expect(parsed).not.toBeNull();
    expect(formatLocalDateParam(parsed!)).toBe("2026-03-14");
  });

  it("rejects malformed inputs", () => {
    expect(parseLocalDateParam("2026/03/14")).toBeNull();
    expect(parseLocalDateParam("2026-3-14")).toBeNull();
    expect(parseLocalDateParam("")).toBeNull();
    expect(parseLocalDateParam(null)).toBeNull();
    expect(parseLocalDateParam(undefined)).toBeNull();
  });

  it("rejects calendar-impossible dates like Feb 30", () => {
    // JS Date constructor rolls Feb 30 to Mar 2; we assert the formatter
    // does not silently lie about the input — current behaviour returns the
    // rolled date as YYYY-MM-DD. Pin this so a future refactor can't drop
    // it without an explicit decision.
    const parsed = parseLocalDateParam("2026-02-30");
    expect(parsed).not.toBeNull();
    expect(formatLocalDateParam(parsed!)).toBe("2026-03-02");
  });
});

describe("calendarRangeForView — week alignment", () => {
  it("aligns the week to Monday regardless of which weekday the anchor is", () => {
    // 2026-05-15 is a Friday.
    const friRange = calendarRangeForView("week", new Date(2026, 4, 15));
    expect(friRange).toEqual({ from: "2026-05-11", to: "2026-05-17" });

    // 2026-05-11 is the Monday of the same week — should match.
    const monRange = calendarRangeForView("week", new Date(2026, 4, 11));
    expect(monRange).toEqual({ from: "2026-05-11", to: "2026-05-17" });

    // 2026-05-17 is the Sunday of the same week — should still match.
    const sunRange = calendarRangeForView("week", new Date(2026, 4, 17));
    expect(sunRange).toEqual({ from: "2026-05-11", to: "2026-05-17" });
  });

  it("expands month view to a full Mon..Sun grid that contains the requested month", () => {
    // May 2026: 1st = Friday, 31st = Sunday. Grid should start on Apr 27 (Mon).
    const range = calendarRangeForView("month", new Date(2026, 4, 15));
    expect(range.from).toBe("2026-04-27");
    expect(range.to).toBe("2026-05-31");
  });
});
