/**
 * Pure date helpers for the calendar's Day / Week / Month views: the visible
 * day range to fetch, the header period title, anchor snapping, and per-view
 * chevron stepping. Extracted from the page component so the per-view cadence
 * (±1 day / ±7 days / ±1 month) is unit-testable without mounting React.
 */

export type CalendarView = "day" | "week" | "month";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function startOfWeek(d: Date): Date {
  const out = startOfDay(d);
  const day = (out.getDay() + 6) % 7; // Monday start
  out.setDate(out.getDate() - day);
  return out;
}

/**
 * Local calendar date as `YYYY-MM-DD` (the format the backend's `from`/`to`
 * params require). Uses local Y/M/D components rather than `toISOString()`,
 * which would shift the date across the UTC boundary in non-UTC timezones.
 */
export function toDateParam(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The inclusive [from, to] day range a given view spans from its anchor. */
export function viewRange(view: CalendarView, anchor: Date): { from: Date; to: Date } {
  if (view === "day") {
    return { from: anchor, to: anchor };
  }
  if (view === "week") {
    const to = new Date(anchor);
    to.setDate(to.getDate() + 6);
    return { from: anchor, to };
  }
  // month: the visible grid runs from the Monday before the 1st to the Sunday
  // after the last day (6 weeks max).
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const dow = (first.getDay() + 6) % 7;
  const from = new Date(first);
  from.setDate(from.getDate() - dow);
  const to = new Date(from);
  to.setDate(to.getDate() + 41);
  return { from, to };
}

/**
 * Header period title, formatted per view. For the Day view, pass `nowUtc`
 * (the current `Date`) to append the contract's ` · HH:mm UTC` clock suffix;
 * it's a live wall-clock, so the caller owns the `new Date()` (this stays pure
 * and testable).
 */
export function periodTitle(view: CalendarView, anchor: Date, nowUtc?: Date): string {
  if (view === "day") {
    const base = `${WEEKDAYS[anchor.getDay()]} ${MONTHS[anchor.getMonth()]} ${anchor.getDate()}, ${anchor.getFullYear()}`;
    if (!nowUtc) return base;
    const hh = String(nowUtc.getUTCHours()).padStart(2, "0");
    const mm = String(nowUtc.getUTCMinutes()).padStart(2, "0");
    return `${base} · ${hh}:${mm} UTC`;
  }
  if (view === "month") {
    return `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;
  }
  const end = new Date(anchor);
  end.setDate(end.getDate() + 6);
  const left = `${MONTHS[anchor.getMonth()]} ${anchor.getDate()}`;
  const right =
    anchor.getMonth() === end.getMonth() ? `${end.getDate()}` : `${MONTHS[end.getMonth()]} ${end.getDate()}`;
  return `${left} — ${right}, ${end.getFullYear()}`;
}

/** Snap an arbitrary date to the canonical anchor for a view. */
export function anchorFor(view: CalendarView, d: Date): Date {
  if (view === "day") return startOfDay(d);
  if (view === "week") return startOfWeek(d);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * Anchor to use when switching FROM `fromView` INTO `toView`, given the current
 * anchor and "today". The general rule keeps the user at the same point in time
 * (`anchorFor(toView, anchor)`). The one special case: switching into **Day**
 * from Week/Month — if the period currently in view contains today, land on
 * today (Day then opens on the current day and scrolls to "now") instead of
 * snapping to the first day of the week/month. When today is out of view (the
 * user paged to another week/month), fall back to the period's first day so the
 * user stays where they were looking.
 */
export function anchorOnViewSwitch(
  fromView: CalendarView,
  toView: CalendarView,
  anchor: Date,
  today: Date,
): Date {
  if (toView === "day" && fromView !== "day") {
    const t = startOfDay(today);
    const { from, to } = viewRange(fromView, anchor);
    if (t >= startOfDay(from) && t <= startOfDay(to)) return t;
  }
  return anchorFor(toView, anchor);
}

/** Step the anchor by one unit in the view's natural cadence. */
export function stepAnchor(view: CalendarView, anchor: Date, dir: 1 | -1): Date {
  const d = new Date(anchor);
  if (view === "day") d.setDate(d.getDate() + dir);
  else if (view === "week") d.setDate(d.getDate() + dir * 7);
  else d.setMonth(d.getMonth() + dir);
  return d;
}
