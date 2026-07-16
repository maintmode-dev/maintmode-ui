import { describe, expect, it } from "vitest";

import { isValidZone, utcIsoToWallClock, wallClockToUtcIso } from "../convert";

describe("wallClockToUtcIso — picker wall-clock → UTC instant (write path)", () => {
  it("converts 18:00 in UTC+3 to 15:00Z (the exact RUK-201 bug)", () => {
    expect(wallClockToUtcIso("2026-07-16T18:00", "Asia/Nicosia")).toBe("2026-07-16T15:00:00.000Z");
  });

  it("is identity for UTC", () => {
    expect(wallClockToUtcIso("2026-07-16T18:00", "UTC")).toBe("2026-07-16T18:00:00.000Z");
  });

  it("crosses the date boundary for a negative offset", () => {
    // 01:00 on the 16th in New York (EDT, UTC-4) is 05:00Z the same day.
    expect(wallClockToUtcIso("2026-07-16T01:00", "America/New_York")).toBe("2026-07-16T05:00:00.000Z");
  });

  it("resolves DST correctly (summer EDT vs winter EST)", () => {
    // 12:00 local, New York: July is UTC-4 → 16:00Z; January is UTC-5 → 17:00Z.
    expect(wallClockToUtcIso("2026-07-16T12:00", "America/New_York")).toBe("2026-07-16T16:00:00.000Z");
    expect(wallClockToUtcIso("2026-01-16T12:00", "America/New_York")).toBe("2026-01-16T17:00:00.000Z");
  });

  it("returns the input unchanged for an unparseable string", () => {
    expect(wallClockToUtcIso("", "Asia/Nicosia")).toBe("");
    expect(wallClockToUtcIso("not-a-date", "Asia/Nicosia")).toBe("not-a-date");
  });
});

describe("utcIsoToWallClock — UTC instant → picker wall-clock (read-back path)", () => {
  it("renders 15:00Z as 18:00 in UTC+3", () => {
    expect(utcIsoToWallClock("2026-07-16T15:00:00Z", "Asia/Nicosia")).toBe("2026-07-16T18:00");
  });

  it("returns '' for empty/invalid input (the picker's unset contract)", () => {
    expect(utcIsoToWallClock("", "Asia/Nicosia")).toBe("");
    expect(utcIsoToWallClock("nope", "Asia/Nicosia")).toBe("");
  });
});

describe("round-trip preserves the operator's wall-clock", () => {
  const zones = ["UTC", "Asia/Nicosia", "America/New_York", "Asia/Kolkata"]; // incl. a half-hour offset
  const walls = ["2026-07-16T18:00", "2026-01-01T00:00", "2026-12-31T23:59"];

  for (const zone of zones) {
    for (const wall of walls) {
      it(`${wall} in ${zone} survives wall→utc→wall`, () => {
        expect(utcIsoToWallClock(wallClockToUtcIso(wall, zone), zone)).toBe(wall);
      });
    }
  }
});

describe("isValidZone", () => {
  it("accepts real IANA ids", () => {
    expect(isValidZone("Asia/Nicosia")).toBe(true);
    expect(isValidZone("UTC")).toBe(true);
    expect(isValidZone("America/New_York")).toBe(true);
  });
  it("rejects unknown/malformed/empty zones", () => {
    expect(isValidZone("Pacific Standard Time")).toBe(false); // Windows-style id
    expect(isValidZone("Asia/Nicosai")).toBe(false); // typo
    expect(isValidZone("")).toBe(false);
    expect(isValidZone(null)).toBe(false);
    expect(isValidZone(undefined)).toBe(false);
  });
});

describe("invalid zone degrades to UTC, never to a corrupt value", () => {
  // Before the safeZone backstop: an unknown zone made TZDate.getTime() NaN, so
  // the write path leaked the raw wall-clock string and the read path returned
  // "NaN-NaN-NaNTNaN:NaN". Both must now fall back to a UTC-consistent result.
  it("wallClockToUtcIso treats a bad zone as UTC", () => {
    expect(wallClockToUtcIso("2026-07-16T18:00", "Pacific Standard Time")).toBe("2026-07-16T18:00:00.000Z");
  });
  it("utcIsoToWallClock treats a bad zone as UTC (no NaN string)", () => {
    expect(utcIsoToWallClock("2026-07-16T18:00:00Z", "Not/AZone")).toBe("2026-07-16T18:00");
  });
});

describe("DST edge cases are resolved deterministically (documented behavior)", () => {
  // These pin whatever @date-fns/tz's TZDate picks so a library change is caught.
  // A maintenance scheduler picks a wall-clock; the rare gap/ambiguous case just
  // needs to resolve consistently, not crash.
  it("spring-forward nonexistent 02:30 resolves forward (no crash)", () => {
    // 2026-03-08 US spring-forward: 02:00→03:00, so 02:30 doesn't exist.
    // TZDate normalizes it; the round-trip therefore does NOT return 02:30.
    const utc = wallClockToUtcIso("2026-03-08T02:30", "America/New_York");
    expect(utc).toBe("2026-03-08T07:30:00.000Z");
    expect(utcIsoToWallClock(utc, "America/New_York")).toBe("2026-03-08T03:30");
  });
  it("fall-back ambiguous 01:30 resolves to a single instant", () => {
    // 2026-11-01 US fall-back: 02:00→01:00, so 01:30 occurs twice; one is chosen.
    expect(wallClockToUtcIso("2026-11-01T01:30", "America/New_York")).toBe("2026-11-01T05:30:00.000Z");
  });
});
