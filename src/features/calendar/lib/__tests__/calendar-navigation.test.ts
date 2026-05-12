import { describe, expect, it } from "vitest";

import {
  buildCalendarSearchParams,
  calendarRangeForView,
  formatLocalDateParam,
  parseCalendarSearchParams,
  parseLocalDateParam,
} from "@/features/calendar/lib/calendar-navigation";

describe("calendar-navigation", () => {
  describe("formatLocalDateParam / parseLocalDateParam", () => {
    it("round-trips a local date without UTC drift", () => {
      const date = new Date(2026, 4, 11);
      expect(formatLocalDateParam(date)).toBe("2026-05-11");
      const parsed = parseLocalDateParam("2026-05-11");
      expect(parsed).not.toBeNull();
      expect(parsed?.getFullYear()).toBe(2026);
      expect(parsed?.getMonth()).toBe(4);
      expect(parsed?.getDate()).toBe(11);
    });

    it("rejects malformed dates", () => {
      expect(parseLocalDateParam(null)).toBeNull();
      expect(parseLocalDateParam("2026-13-01")).not.toBeNull();
      expect(parseLocalDateParam("not-a-date")).toBeNull();
      expect(parseLocalDateParam("")).toBeNull();
    });
  });

  describe("calendarRangeForView", () => {
    const monday = new Date(2026, 4, 11); // Mon 2026-05-11

    it("uses Monday-Sunday for week", () => {
      const range = calendarRangeForView("week", monday);
      expect(range).toEqual({ from: "2026-05-11", to: "2026-05-17" });
    });

    it("anchors month grid on the Monday containing the 1st of the month", () => {
      const range = calendarRangeForView("month", new Date(2026, 4, 15));
      // 2026-05-01 is a Friday; grid should start Monday 2026-04-27.
      expect(range.from).toBe("2026-04-27");
      // 2026-05-31 is a Sunday, so the last grid week finishes on that Sunday
      // and we do not need a sixth row that month.
      expect(range.to).toBe("2026-05-31");
    });

    it("returns the same day for day view", () => {
      const range = calendarRangeForView("day", monday);
      expect(range).toEqual({ from: "2026-05-11", to: "2026-05-11" });
    });
  });

  describe("parseCalendarSearchParams / buildCalendarSearchParams", () => {
    it("parses defaults when nothing is provided", () => {
      const state = parseCalendarSearchParams(new URLSearchParams());
      expect(state.view).toBe("month");
      expect(state.scope).toBe("all");
      expect(state.statuses).toEqual([]);
      expect(state.resourceIds).toEqual([]);
    });

    it("parses statuses + resource_ids as multi-values and dedupes", () => {
      const state = parseCalendarSearchParams(
        new URLSearchParams("view=week&date=2026-05-11&scope=resource&statuses=draft,planned&statuses=planned&resource_ids=r2&resource_ids=r1"),
      );
      expect(state.view).toBe("week");
      expect(state.date).toBe("2026-05-11");
      expect(state.scope).toBe("resource");
      expect(state.statuses).toEqual(["draft", "planned"]);
      expect(state.resourceIds).toEqual(["r1", "r2"]);
    });

    it("rebuilds search params with sorted multi-values", () => {
      const params = buildCalendarSearchParams({
        view: "month",
        date: "2026-05-11",
        scope: "global",
        statuses: ["planned", "draft"],
        resourceIds: ["r2", "r1"],
      });
      expect(params.get("view")).toBe("month");
      expect(params.get("scope")).toBe("global");
      expect(params.getAll("statuses")).toEqual(["draft", "planned"]);
      expect(params.getAll("resource_ids")).toEqual(["r1", "r2"]);
    });

    it("omits scope=all to keep URLs clean", () => {
      const params = buildCalendarSearchParams({
        view: "month",
        date: "2026-05-11",
        scope: "all",
        statuses: [],
        resourceIds: [],
      });
      expect(params.has("scope")).toBe(false);
    });
  });
});
