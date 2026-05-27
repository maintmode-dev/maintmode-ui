import { describe, expect, it } from "vitest";

import type { Maintenance } from "@/domain/maintenance/maintenance";

import { placeItems } from "../place-items";

// Build a local-time anchor for Monday 2026-05-25 00:00 in the runner's TZ.
// We intentionally avoid `Z` so tests are stable regardless of TZ — the
// placement logic itself is local-time (consumers pass `anchor` from
// `startOfWeek(new Date())`, which is local too).
const monday = new Date(2026, 4, 25, 0, 0, 0); // months are 0-indexed
const iso = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(y, m - 1, d, h, min, 0).toISOString();

function mk(id: string, startIso: string, endIso: string): Maintenance {
  return {
    id,
    title: id,
    status: "planned",
    impact: "none",
    scope: "internal",
    planned_period: { start: startIso, end: endIso },
    resources: [],
    steps: [],
    created_at: startIso,
    updated_at: startIso,
  };
}

describe("placeItems", () => {
  it("returns [] for an empty input", () => {
    expect(placeItems([], monday)).toEqual([]);
  });

  it("places a single in-week event on the correct day", () => {
    const m = mk("e1", iso(2026, 5, 26, 10), iso(2026, 5, 26, 11));
    const placed = placeItems([m], monday);
    expect(placed).toHaveLength(1);
    expect(placed[0].dayIdx).toBe(1); // Tue
    expect(placed[0].continuation).toBe(false);
    expect(placed[0].lane).toBe(0);
    expect(placed[0].lanes).toBe(1);
  });

  it("splits a cross-midnight event into start + continuation segments", () => {
    const m = mk("cross", iso(2026, 5, 26, 23), iso(2026, 5, 27, 2));
    const placed = placeItems([m], monday);
    expect(placed).toHaveLength(2);
    const [first, second] = placed.sort((a, b) => a.dayIdx - b.dayIdx);
    expect(first.dayIdx).toBe(1); // Tue
    expect(first.continuation).toBe(false);
    expect(second.dayIdx).toBe(2); // Wed
    expect(second.continuation).toBe(true);
    expect(second.topPct).toBe(0);
  });

  it("clips an event that extends past the visible week to the week boundary", () => {
    // Starts Sunday 22:00, ends following Monday 02:00 → only Sunday segment fits.
    const m = mk("late", iso(2026, 5, 31, 22), iso(2026, 6, 1, 2));
    const placed = placeItems([m], monday);
    expect(placed).toHaveLength(1);
    expect(placed[0].dayIdx).toBe(6); // Sun
  });

  it("ignores events with invalid or inverted dates", () => {
    const invalid = mk("bad", "not-a-date", iso(2026, 5, 26, 11));
    const inverted = mk("inv", iso(2026, 5, 26, 15), iso(2026, 5, 26, 10));
    expect(placeItems([invalid, inverted], monday)).toEqual([]);
  });

  it("ignores events entirely outside the visible week", () => {
    const past = mk("past", iso(2026, 5, 10, 10), iso(2026, 5, 10, 11));
    const future = mk("future", iso(2026, 6, 10, 10), iso(2026, 6, 10, 11));
    expect(placeItems([past, future], monday)).toEqual([]);
  });

  it("assigns overlapping events on the same day to distinct lanes", () => {
    const a = mk("a", iso(2026, 5, 26, 9), iso(2026, 5, 26, 11));
    const b = mk("b", iso(2026, 5, 26, 10), iso(2026, 5, 26, 12));
    const placed = placeItems([a, b], monday);
    expect(placed).toHaveLength(2);
    const lanes = placed.map((p) => p.lane).sort();
    expect(lanes).toEqual([0, 1]);
    expect(placed.every((p) => p.lanes === 2)).toBe(true);
  });

  it("packs non-overlapping events on the same day onto lane 0 (totalLanes=1)", () => {
    const a = mk("a", iso(2026, 5, 26, 9), iso(2026, 5, 26, 10));
    const b = mk("b", iso(2026, 5, 26, 14), iso(2026, 5, 26, 15));
    const placed = placeItems([a, b], monday);
    expect(placed).toHaveLength(2);
    expect(placed.every((p) => p.lane === 0)).toBe(true);
    expect(placed.every((p) => p.lanes === 1)).toBe(true);
  });

  it("never produces a heightPct below 2% for very short events", () => {
    const blip = mk("blip", iso(2026, 5, 26, 10), new Date(2026, 4, 26, 10, 0, 30).toISOString());
    const placed = placeItems([blip], monday);
    expect(placed[0].heightPct).toBeGreaterThanOrEqual(2);
  });
});
