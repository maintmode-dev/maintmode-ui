import { describe, expect, it } from "vitest";

import { durationToMinutes } from "@/server/backend/maintenance/adapters";

// Edge-case coverage for the Go `time.Duration.String()` parser. Background:
// commit d24e0c3 fixed trailing `0s` formatting (e.g. "15m0s"). These cases
// pin down behaviour for shapes we haven't yet seen in production payloads.

describe("durationToMinutes — edge cases", () => {
  it("ignores trailing seconds component", () => {
    expect(durationToMinutes("45s")).toBe(0);
  });

  it("treats a bare zero as zero minutes", () => {
    expect(durationToMinutes("0")).toBe(0);
  });

  it("returns zero for an empty seconds-only stanza like 0s", () => {
    expect(durationToMinutes("0s")).toBe(0);
  });

  it("returns zero for fractional or unsupported notations", () => {
    expect(durationToMinutes("1.5h")).toBe(0);
    expect(durationToMinutes("90s")).toBe(0);
  });

  it("rejects negative durations as unparseable", () => {
    expect(durationToMinutes("-30m")).toBe(0);
  });

  it("trims surrounding whitespace", () => {
    expect(durationToMinutes("  1h30m  ")).toBe(90);
  });

  it("handles the hours-only stanza 1h", () => {
    expect(durationToMinutes("1h")).toBe(60);
  });

  it("handles the minutes-only stanza 30m", () => {
    expect(durationToMinutes("30m")).toBe(30);
  });

  it("returns zero for unknown unit suffixes", () => {
    expect(durationToMinutes("5d")).toBe(0);
  });
});
