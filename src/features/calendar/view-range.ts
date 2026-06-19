/**
 * Pure date helpers for the calendar's Day / Week / Month views: the visible
 * day range to fetch, the header period title, anchor snapping, and per-view
 * chevron stepping. Extracted from the page component so the per-view cadence
 * (±1 day / ±7 days / ±1 month) is unit-testable without mounting React.
 *
 * Everything here works in **UTC**, never the process/browser timezone. The
 * whole calendar is UTC (FullCalendar `timeZone:"UTC"`, all formatters pinned to
 * UTC). Critically, the anchor and its rendered title must be timezone-stable so
 * that the SSR pass (UTC container) and the first client render (operator's
 * local TZ) produce identical text — reading `getDate()`/`getDay()` (local) off
 * an anchor seeded from `new Date()` diverged across the UTC↔local midnight
 * boundary and tripped a React hydration mismatch (#418) in the Day-view `<h1>`.
 */

export type CalendarView = "day" | "week" | "month";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function startOfWeek(d: Date): Date {
  const out = startOfDay(d);
  const day = (out.getUTCDay() + 6) % 7; // Monday start
  out.setUTCDate(out.getUTCDate() - day);
  return out;
}

/**
 * UTC calendar date as `YYYY-MM-DD` (the format the backend's `from`/`to`
 * params require). Reads UTC components so the param matches the UTC anchor and
 * the UTC grid — the whole calendar reasons in UTC, so "today" is the UTC day.
 */
export function toDateParam(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The inclusive [from, to] day range a given view spans from its anchor. */
export function viewRange(view: CalendarView, anchor: Date): { from: Date; to: Date } {
  if (view === "day") {
    return { from: anchor, to: anchor };
  }
  if (view === "week") {
    const to = new Date(anchor);
    to.setUTCDate(to.getUTCDate() + 6);
    return { from: anchor, to };
  }
  // month: the visible grid runs from the Monday before the 1st to the Sunday
  // after the last day (6 weeks max).
  const first = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  const dow = (first.getUTCDay() + 6) % 7;
  const from = new Date(first);
  from.setUTCDate(from.getUTCDate() - dow);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 41);
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
    const base = `${WEEKDAYS[anchor.getUTCDay()]} ${MONTHS[anchor.getUTCMonth()]} ${anchor.getUTCDate()}, ${anchor.getUTCFullYear()}`;
    if (!nowUtc) return base;
    const hh = String(nowUtc.getUTCHours()).padStart(2, "0");
    const mm = String(nowUtc.getUTCMinutes()).padStart(2, "0");
    return `${base} · ${hh}:${mm} UTC`;
  }
  if (view === "month") {
    return `${MONTHS[anchor.getUTCMonth()]} ${anchor.getUTCFullYear()}`;
  }
  const end = new Date(anchor);
  end.setUTCDate(end.getUTCDate() + 6);
  const left = `${MONTHS[anchor.getUTCMonth()]} ${anchor.getUTCDate()}`;
  const right =
    anchor.getUTCMonth() === end.getUTCMonth()
      ? `${end.getUTCDate()}`
      : `${MONTHS[end.getUTCMonth()]} ${end.getUTCDate()}`;
  return `${left} — ${right}, ${end.getUTCFullYear()}`;
}

/** Snap an arbitrary date to the canonical (UTC) anchor for a view. */
export function anchorFor(view: CalendarView, d: Date): Date {
  if (view === "day") return startOfDay(d);
  if (view === "week") return startOfWeek(d);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
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
  if (view === "day") d.setUTCDate(d.getUTCDate() + dir);
  else if (view === "week") d.setUTCDate(d.getUTCDate() + dir * 7);
  else d.setUTCMonth(d.getUTCMonth() + dir);
  return d;
}
