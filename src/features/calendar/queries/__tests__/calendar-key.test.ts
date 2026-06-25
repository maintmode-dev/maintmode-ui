import { describe, expect, it } from "vitest";

import { calendarKey } from "../use-calendar-query";

const base = { from: "2026-06-22", to: "2026-06-28" };

describe("calendarKey", () => {
  it("is stable regardless of status insertion order", () => {
    // Toggling chips builds the status array in different orders; equivalent
    // filters must hash to the same key so they share a cache entry instead of
    // refetching. The key sorts statuses to guarantee this.
    const a = calendarKey({ ...base, statuses: ["planned", "in_progress"] });
    const b = calendarKey({ ...base, statuses: ["in_progress", "planned"] });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("differs when the status set differs", () => {
    const a = calendarKey({ ...base, statuses: ["planned"] });
    const b = calendarKey({ ...base, statuses: ["planned", "canceled"] });
    expect(JSON.stringify(a)).not.toEqual(JSON.stringify(b));
  });

  it("differs when the window differs", () => {
    const a = calendarKey({ ...base, statuses: ["planned"] });
    const b = calendarKey({ from: "2026-06-29", to: "2026-07-05", statuses: ["planned"] });
    expect(JSON.stringify(a)).not.toEqual(JSON.stringify(b));
  });

  it("treats omitted statuses as empty (not undefined)", () => {
    const a = calendarKey(base);
    const b = calendarKey({ ...base, statuses: [] });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});
