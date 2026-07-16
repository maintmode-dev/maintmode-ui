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

// Window formatters now take an explicit IANA zone (RUK-201). Most assertions
// below pin UTC so they read like the old behavior; the dedicated zone block
// proves the "18 = 18" shift.
const UTC = "UTC";

// Regression: the backend returns `updated_at: ""` for never-updated rows.
// `new Date("")` is an Invalid Date and `Intl.DateTimeFormat.format` throws a
// `RangeError: Invalid time value` on it, which crashed MaintenanceQuickSheet
// (and any component rendering such a timestamp). The formatters must degrade
// to a placeholder instead of throwing.
describe("date formatters tolerate empty/invalid input", () => {
  const bad = ["", "   ", "not-a-date", "0000-00-00"];

  it("formatTime does not throw on bad input", () => {
    for (const v of bad) expect(() => formatTime(v, UTC)).not.toThrow();
    expect(formatTime("", UTC)).toBe("—");
  });

  it("formatDate does not throw on bad input", () => {
    for (const v of bad) expect(() => formatDate(v, UTC)).not.toThrow();
    expect(formatDate("", UTC)).toBe("—");
  });

  it("formatDateTime does not throw on bad input", () => {
    for (const v of bad) expect(() => formatDateTime(v, UTC)).not.toThrow();
    expect(formatDateTime("", UTC)).toBe("—");
  });

  it("formatRange does not throw when either bound is bad", () => {
    expect(() => formatRange("", "", UTC)).not.toThrow();
    expect(() => formatRange("2026-06-09T10:00:00Z", "", UTC)).not.toThrow();
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

describe("formatUtc renders the project ISO-UTC convention (identity stamps stay UTC)", () => {
  it("emits `YYYY-MM-DD HH:mm UTC` in UTC regardless of viewer locale", () => {
    // 2026-06-09T10:05:00Z → fixed UTC wall-clock, zero-padded, ` UTC` suffix.
    expect(formatUtc("2026-06-09T10:05:00Z")).toBe("2026-06-09 10:05 UTC");
  });

  it("does not shift the instant into the local timezone", () => {
    // Midnight UTC must read 00:00, not a local-offset hour.
    expect(formatUtc("2026-01-01T00:00:00Z")).toBe("2026-01-01 00:00 UTC");
  });
});

describe("window formatters render in the given zone", () => {
  // Pinned to UTC: these must line up with the calendar grid / audit stamps when
  // the operator has no zone / picks UTC.
  it("formatTime emits the UTC wall-clock", () => {
    expect(formatTime("2026-06-09T10:00:00Z", UTC)).toBe("10:00");
  });

  it("formatRange emits both bounds in UTC", () => {
    expect(formatRange("2026-06-09T10:00:00Z", "2026-06-09T11:30:00Z", UTC)).toBe("10:00 – 11:30");
  });

  it("formatDate uses the UTC calendar day at a TZ boundary", () => {
    // 23:30 UTC is already the 9th in UTC but the 10th in a far-east locale —
    // must read the UTC day when UTC is the chosen zone.
    expect(formatDate("2026-06-09T23:30:00Z", UTC)).toBe("Jun 09");
  });

  it("formatDateTime emits the UTC date and time", () => {
    expect(formatDateTime("2026-06-09T10:05:00Z", UTC)).toBe("Jun 09, 2026, 10:05");
  });
});

describe("window formatters shift into the operator's zone (RUK-201 core)", () => {
  // The bug: a 15:00Z instant read "15:00" for a UTC+3 operator who scheduled
  // "18:00". In their zone it must read 18:00.
  it("formatTime renders 15:00Z as 18:00 in Asia/Nicosia (UTC+3)", () => {
    expect(formatTime("2026-07-16T15:00:00Z", "Asia/Nicosia")).toBe("18:00");
  });

  it("formatRange renders a window in the operator's zone", () => {
    expect(formatRange("2026-07-16T15:00:00Z", "2026-07-16T16:00:00Z", "Asia/Nicosia")).toBe("18:00 – 19:00");
  });

  it("formatDate rolls to the next calendar day when the zone crosses midnight", () => {
    // 22:30Z is the 16th in UTC but 01:30 on the 17th in UTC+3.
    expect(formatDate("2026-07-16T22:30:00Z", "Asia/Nicosia")).toBe("Jul 17");
  });

  it("respects DST: the same wall-clock offset differs across the year", () => {
    // America/New_York is UTC-4 in July (EDT): 14:00Z → 10:00.
    expect(formatTime("2026-07-16T14:00:00Z", "America/New_York")).toBe("10:00");
    // …and UTC-5 in January (EST): 14:00Z → 09:00.
    expect(formatTime("2026-01-16T14:00:00Z", "America/New_York")).toBe("09:00");
  });

  it("formatUtc is unaffected by the operator zone (stamps stay UTC)", () => {
    // No zone param — a stamp reads identically for every viewer.
    expect(formatUtc("2026-07-16T15:00:00Z")).toBe("2026-07-16 15:00 UTC");
  });
});
