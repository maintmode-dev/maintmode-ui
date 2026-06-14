import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatRange,
  formatRelative,
  formatTime,
  formatUtc,
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

  it("formatUtc does not throw on bad/empty input", () => {
    for (const v of bad) expect(() => formatUtc(v)).not.toThrow();
    expect(formatUtc("")).toBe("—");
    expect(formatUtc(null)).toBe("—");
    expect(formatUtc(undefined)).toBe("—");
  });
});

describe("formatDuration renders compact step durations", () => {
  it("collapses Go-style zero components", () => {
    expect(formatDuration("2h0m0s")).toBe("2h");
    expect(formatDuration("90m0s")).toBe("1h30m");
    expect(formatDuration("0m30s")).toBe("30s");
  });
  it("reads a bare integer as minutes", () => {
    expect(formatDuration("120")).toBe("2h");
    expect(formatDuration("5")).toBe("5m");
  });
  it("parses ISO-8601 PT durations", () => {
    expect(formatDuration("PT1H30M")).toBe("1h30m");
    expect(formatDuration("PT45M")).toBe("45m");
  });
  it("returns undefined for empty/missing input", () => {
    expect(formatDuration(undefined)).toBeUndefined();
    expect(formatDuration("")).toBeUndefined();
  });
  it("passes through an unparseable string unchanged", () => {
    expect(formatDuration("soon")).toBe("soon");
  });
});

describe("formatUtc renders the project ISO-UTC convention", () => {
  it("emits `YYYY-MM-DD HH:mm UTC` in UTC regardless of viewer locale", () => {
    // 2026-06-09T10:05:00Z → fixed UTC wall-clock, zero-padded, ` UTC` suffix.
    expect(formatUtc("2026-06-09T10:05:00Z")).toBe("2026-06-09 10:05 UTC");
  });

  it("does not shift the instant into the local timezone", () => {
    // Midnight UTC must read 00:00, not a local-offset hour.
    expect(formatUtc("2026-01-01T00:00:00Z")).toBe("2026-01-01 00:00 UTC");
  });
});

describe("date formatters render in UTC, not the viewer's locale", () => {
  // Pin exact UTC output so a regression back to local time fails on any
  // machine — the whole product reasons about maintenance windows in UTC, and
  // these ranges must line up with the calendar grid / Day-view UTC clock.
  it("formatTime emits the UTC wall-clock", () => {
    expect(formatTime("2026-06-09T10:00:00Z")).toBe("10:00");
  });

  it("formatRange emits both bounds in UTC", () => {
    expect(formatRange("2026-06-09T10:00:00Z", "2026-06-09T11:30:00Z")).toBe("10:00 – 11:30");
  });

  it("formatDate uses the UTC calendar day at a TZ boundary", () => {
    // 23:30 UTC is already the 9th in UTC but the 10th in a far-east locale —
    // must read the UTC day.
    expect(formatDate("2026-06-09T23:30:00Z")).toBe("Jun 09");
  });

  it("formatDateTime emits the UTC date and time", () => {
    expect(formatDateTime("2026-06-09T10:05:00Z")).toBe("Jun 09, 2026, 10:05");
  });
});
