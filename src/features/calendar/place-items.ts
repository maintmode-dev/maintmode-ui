import type { Maintenance } from "@/domain/maintenance/maintenance";

const MS_PER_DAY = 86_400_000;
const MS_PER_MIN = 60_000;

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
export function placeItems(items: Maintenance[], weekStart: Date): Placed[] {
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
  // time get distinct lanes; non-overlapping bars reuse lane 0.
  const placed: Placed[] = [];
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
    const totalLanes = Math.max(1, laneBottoms.length);
    dayBars.forEach((bar, i) => {
      placed.push({ ...bar, lane: lanes[i], lanes: totalLanes });
    });
  }
  return placed;
}
