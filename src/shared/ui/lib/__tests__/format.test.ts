import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDateTime,
  formatRange,
  formatRelative,
  formatTime,
} from "../format";

// Regression: the backend returns `updated_at: ""` for never-updated rows.
// `new Date("")` is an Invalid Date and `Intl.DateTimeFormat.format` throws a
// `RangeError: Invalid time value` on it, which crashed MaintenanceQuickSheet
// (and any component rendering such a timestamp). The formatters must degrade
// to a placeholder instead of throwing.
describe("date formatters tolerate empty/invalid input", () => {
  const bad = ["", "   ", "not-a-date", "0000-00-00"];

  it("formatTime does not throw on bad input", () => {
    for (const v of bad) expect(() => formatTime(v)).not.toThrow();
    expect(formatTime("")).toBe("—");
  });

  it("formatDate does not throw on bad input", () => {
    for (const v of bad) expect(() => formatDate(v)).not.toThrow();
    expect(formatDate("")).toBe("—");
  });

  it("formatDateTime does not throw on bad input", () => {
    for (const v of bad) expect(() => formatDateTime(v)).not.toThrow();
    expect(formatDateTime("")).toBe("—");
  });

  it("formatRange does not throw when either bound is bad", () => {
    expect(() => formatRange("", "")).not.toThrow();
    expect(() => formatRange("2026-06-09T10:00:00Z", "")).not.toThrow();
  });

  it("formatRelative does not throw on bad input", () => {
    for (const v of bad) expect(() => formatRelative(v)).not.toThrow();
    expect(formatRelative("")).toBe("—");
  });
});

describe("date formatters still work for valid input", () => {
  it("formats a valid ISO timestamp", () => {
    // Exact wording depends on locale/TZ; assert it produced a non-placeholder.
    expect(formatDate("2026-06-09T10:00:00Z")).not.toBe("—");
    expect(formatDateTime("2026-06-09T10:00:00Z")).not.toBe("—");
    expect(formatTime("2026-06-09T10:00:00Z")).not.toBe("—");
  });
});
