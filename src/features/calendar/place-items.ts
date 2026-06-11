import type { Maintenance } from "@/domain/maintenance/maintenance";

const MS_PER_DAY = 86_400_000;
const MS_PER_MIN = 60_000;

/**
 * Max side-by-side lanes before overflow collapses to a "+N more" marker.
 * Beyond ~3 lanes the bars are too narrow to read any title, so further
 * concurrent events are summarised rather than rendered as slivers.
 */
export const MAX_LANES = 3;

export interface Placed {
  m: Maintenance;
  dayIdx: number;
  topPct: number;
  heightPct: number;
  /** True when this is a continuation of an event that started on a previous day. */
  continuation?: boolean;
  /** Horizontal slot to handle overlaps (0..lanes-1). */
  lane: number;
  lanes: number;
}

/** A collapsed cluster of overflow events ("+N more") in a day column. */
export interface OverflowMarker {
  dayIdx: number;
  /** Vertical anchor (top of the overflowing cluster). */
  topPct: number;
  count: number;
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/**
 * Place each maintenance onto one or more day columns. Events that cross
 * midnight are split: one segment from `start..23:59` on the start day, plus
 * a continuation from `00:00..end` on the end day (and any whole days in
 * between get a full-column bar). Lane assignment groups overlapping bars
 * on the same day so they render side-by-side instead of stacking on top
 * of each other.
 *
 * Pure function — exported separately so it can be unit-tested without
 * mounting the React grid.
 */
export interface WeekLayout {
  placed: Placed[];
  overflow: OverflowMarker[];
}

export function placeWeek(items: Maintenance[], weekStart: Date): WeekLayout {
  // weekStart is at 00:00; weekEnd is exclusive at +7 days 00:00.
  const weekStartMs = startOfDay(weekStart).getTime();
  const weekEndMs = weekStartMs + 7 * MS_PER_DAY;

  // Step 1: per-day raw placements (each event may produce 1..N entries).
  type Raw = Omit<Placed, "lane" | "lanes">;
  const raw: Raw[] = [];

  for (const m of items) {
    const start = new Date(m.planned_period.start);
    const end = new Date(m.planned_period.end);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) continue;
    if (end.getTime() <= start.getTime()) continue;

    // Clip to the visible week.
    const evStart = Math.max(start.getTime(), weekStartMs);
    const evEnd = Math.min(end.getTime(), weekEndMs);
    if (evEnd <= evStart) continue;

    // Walk each day the event overlaps.
    for (let d = 0; d < 7; d += 1) {
      const dayStartMs = weekStartMs + d * MS_PER_DAY;
      const dayEndMs = dayStartMs + MS_PER_DAY;
      if (evEnd <= dayStartMs || evStart >= dayEndMs) continue;

      const segStart = Math.max(evStart, dayStartMs);
      const segEnd = Math.min(evEnd, dayEndMs);
      const startMin = (segStart - dayStartMs) / MS_PER_MIN;
      const endMin = (segEnd - dayStartMs) / MS_PER_MIN;
      raw.push({
        m,
        dayIdx: d,
        topPct: (startMin / 1440) * 100,
        heightPct: Math.max(((endMin - startMin) / 1440) * 100, 2),
        continuation: segStart > evStart,
      });
    }
  }

  // Step 2: lane-assign per day to handle overlaps. Bars that overlap in
  // time get distinct lanes; non-overlapping bars reuse lane 0. Lanes beyond
  // MAX_LANES collapse into a "+N more" overflow marker instead of rendering
  // as unreadable slivers.
  const placed: Placed[] = [];
  const overflow: OverflowMarker[] = [];
  for (let d = 0; d < 7; d += 1) {
    const dayBars = raw.filter((r) => r.dayIdx === d).sort((a, b) => a.topPct - b.topPct);
    // Each lane holds the bottom edge (topPct + heightPct) of its last bar.
    const laneBottoms: number[] = [];
    const lanes: number[] = [];
    for (const bar of dayBars) {
      let assigned = -1;
      for (let i = 0; i < laneBottoms.length; i += 1) {
        if (laneBottoms[i] <= bar.topPct + 0.0001) {
          assigned = i;
          break;
        }
      }
      if (assigned === -1) {
        laneBottoms.push(bar.topPct + bar.heightPct);
        assigned = laneBottoms.length - 1;
      } else {
        laneBottoms[assigned] = bar.topPct + bar.heightPct;
      }
      lanes.push(assigned);
    }
    // Render width is capped at MAX_LANES; bars in higher lanes are overflow.
    const visibleLanes = Math.min(Math.max(1, laneBottoms.length), MAX_LANES);
    let overflowCount = 0;
    let overflowTop = Number.POSITIVE_INFINITY;
    dayBars.forEach((bar, i) => {
      if (lanes[i] < MAX_LANES) {
        placed.push({ ...bar, lane: lanes[i], lanes: visibleLanes });
      } else {
        overflowCount += 1;
        overflowTop = Math.min(overflowTop, bar.topPct);
      }
    });
    if (overflowCount > 0) {
      overflow.push({ dayIdx: d, topPct: overflowTop, count: overflowCount });
    }
  }
  return { placed, overflow };
}

/**
 * Back-compat: just the placed bars (no overflow markers). Retained for
 * callers/tests that only need lane-packed placements.
 */
export function placeItems(items: Maintenance[], weekStart: Date): Placed[] {
  return placeWeek(items, weekStart).placed;
}

/**
 * Single-day placement for the Day view. A thin wrapper over `placeWeek`:
 * treat `day` as a one-day window and keep only the bars + overflow that land
 * on its first (and only relevant) column. `dayIdx` is always 0.
 */
export function placeDay(items: Maintenance[], day: Date): WeekLayout {
  const { placed, overflow } = placeWeek(items, startOfDay(day));
  return {
    placed: placed.filter((p) => p.dayIdx === 0),
    overflow: overflow.filter((o) => o.dayIdx === 0),
  };
}

/** Back-compat: just the placed bars for the Day view. */
export function placeDayItems(items: Maintenance[], day: Date): Placed[] {
  return placeDay(items, day).placed;
}
