/**
 * Filter model for the calendar sidebar.
 *
 * Two of the three dimensions are filtered SERVER-SIDE: the query sends the
 * active `statuses` and the selected `resource_ids`, so the events the page
 * receives are already narrowed on both. Only `scope` is applied here, because
 * the backend ignores it.
 *
 * Kept free of React so the predicate is unit-testable without mounting the
 * sidebar — the page owns the `CalendarFilterState` and passes the result of
 * `applyCalendarFilters` to the Day/Week/Month grids.
 */

import type { CalendarEvent, MaintenanceScope, MaintenanceStatus } from "@/domain/maintenance/maintenance";
import { startOfDay } from "./view-range";

/**
 * The scope filter values, in display order. Single source of truth: the
 * `ScopeFilter` type is derived from this list AND the `satisfies` pins it to
 * `"all" | MaintenanceScope`, so the runtime validator (`readStoredFilters`) and
 * the compile-time type can't drift apart — and a new `MaintenanceScope` that
 * isn't surfaced here is a type error.
 */
const SCOPE_VALUES = ["all", "global", "resource"] as const satisfies ("all" | MaintenanceScope)[];

/** Scope filter: `all` shows both, otherwise restrict to one `MaintenanceScope`. */
export type ScopeFilter = (typeof SCOPE_VALUES)[number];

export interface CalendarFilterState {
  /**
   * Statuses kept visible on the grid. A maintenance is shown only if its
   * status is in this set. Defaults (set by the page) to Planned + In progress.
   */
  statuses: Set<MaintenanceStatus>;
  scope: ScopeFilter;
  /**
   * Selected resources, `id → name`. Empty = no resource filter.
   *
   * Filtering by these happens SERVER-SIDE: the ids go out as repeated
   * `resource_ids` query params and the backend returns an already-narrowed
   * window (RUK-256). Nothing in this module filters on them.
   *
   * A `Map` rather than a `Set` of ids because the picker searches the
   * catalogue server-side, so its results are keyed on the current search text
   * — clearing the box would leave a selected chip with no name to render. The
   * name is captured at selection time and carried here, in the SAME container
   * as the id: two containers would have to be cleared in step by every path
   * that clears a selection (chip removal, "Reset filters"), and one of them
   * would eventually be missed.
   */
  resources: Map<string, string>;
}

/** The statuses active by default per the design contract (chips for the rest start off). */
export const DEFAULT_STATUSES: MaintenanceStatus[] = ["planned", "in_progress"];

/**
 * The five statuses, in lifecycle order. Dual-purpose, hence the `satisfies`:
 *  - drives the chip row order in the sidebar, and
 *  - is the allowlist `readStoredFilters` validates persisted statuses against.
 * The `as const satisfies readonly MaintenanceStatus[]` pins it to the domain
 * enum so a newly-added `MaintenanceStatus` that isn't surfaced here is a
 * compile error (and can't slip past the persistence validator unnoticed).
 */
export const STATUS_ORDER = [
  "planned",
  "in_progress",
  "draft",
  "completed",
  "canceled",
] as const satisfies readonly MaintenanceStatus[];

export function defaultFilterState(): CalendarFilterState {
  return {
    statuses: new Set(DEFAULT_STATUSES),
    scope: "all",
    resources: new Map(),
  };
}

/** localStorage key for the persisted status/scope selections. */
export const FILTERS_STORAGE_KEY = "maintmode.calendar.filters";

/**
 * Serializable slice of the filter state we persist across refresh/logout:
 * `statuses` + `scope`. `resources` is deliberately NOT persisted.
 *
 * The reason CHANGED with RUK-256 and is worth stating, because the old one no
 * longer holds: selections used to be scoped to whatever resources appeared in
 * the loaded window, so a stored id could silently filter to nothing elsewhere.
 * The picker now reads the global catalogue, so a stored id would be perfectly
 * valid in any window.
 *
 * It stays unpersisted on a product judgement instead: a resource filter
 * restored from a previous session narrows the calendar with no visible cause,
 * and the operator did not ask for it on this visit.
 */
interface PersistedFilters {
  statuses: MaintenanceStatus[];
  scope: ScopeFilter;
}

/** Plain (JSON-safe) projection of the filters worth persisting. */
export function serializeFilters(f: CalendarFilterState): PersistedFilters {
  return { statuses: Array.from(f.statuses), scope: f.scope };
}

/**
 * Read persisted status/scope from localStorage, validating every field against
 * the known enums (stored JSON is untrusted — a stale/hand-edited value must not
 * crash or smuggle in an unknown status). Returns the default state on anything
 * unexpected, with `resources` always reset to empty. SSR-safe (no `window`).
 */
export function readStoredFilters(): CalendarFilterState {
  const fallback = defaultFilterState();
  if (typeof window === "undefined") return fallback;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(FILTERS_STORAGE_KEY);
  } catch {
    return fallback; // localStorage may be unavailable (private mode)
  }
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedFilters>;
    const statuses = Array.isArray(parsed.statuses)
      ? parsed.statuses.filter((s): s is MaintenanceStatus => STATUS_ORDER.includes(s as MaintenanceStatus))
      : null;
    const scope = SCOPE_VALUES.includes(parsed.scope as ScopeFilter)
      ? (parsed.scope as ScopeFilter)
      : fallback.scope;
    // An empty (or invalid) status array means "show nothing" — almost never
    // intended and indistinguishable from corruption, so fall back to defaults.
    return {
      statuses: statuses && statuses.length > 0 ? new Set(statuses) : new Set(DEFAULT_STATUSES),
      scope,
      resources: new Map(),
    };
  } catch {
    return fallback;
  }
}

/**
 * True when a maintenance passes the one remaining CLIENT filter dimension:
 * scope.
 *
 * Status and resource are both filtered SERVER-SIDE — the calendar query sends
 * the active `statuses` and the selected `resource_ids`, so `items` arrives
 * already narrowed on both. Re-checking either here would double-filter and
 * reintroduce the `items`-vs-rendered drift this split removes.
 *
 * Scope alone stays client-side, because the backend ignores it.
 */
export function matchesFilters(m: CalendarEvent, f: CalendarFilterState): boolean {
  return f.scope === "all" || m.scope === f.scope;
}

export function applyCalendarFilters(items: CalendarEvent[], f: CalendarFilterState): CalendarEvent[] {
  return items.filter((m) => matchesFilters(m, f));
}

/**
 * The next upcoming maintenances for the "Up next" panel — a tight, today-scoped
 * operational list (not a window-wide one): a maintenance qualifies when its
 * status is `in_progress`/`planned` (drafts/completed/canceled excluded) AND it
 * is relevant *now*, meaning one of:
 *   - running at this moment (`start ≤ now ≤ end`), or
 *   - starting today (UTC), or
 *   - starting tomorrow (UTC).
 *
 * Scoping to today/tomorrow keeps the panel a "what's happening / what's next"
 * list even on Week/Month views, where the full window would otherwise dump
 * every in-progress item (including ones whose planned end is long past) into
 * the rail. In-progress sorts first; the rest by planned start.
 */
export function upcomingItems(items: CalendarEvent[], now: Date, limit = 5): CalendarEvent[] {
  const nowMs = now.getTime();
  const today = startOfDay(now).getTime();
  const dayAfterTomorrow = today + 2 * 24 * 60 * 60 * 1000; // exclusive upper bound

  const candidates = items.filter((m) => {
    if (m.status !== "in_progress" && m.status !== "planned") return false;
    const start = new Date(m.planned_period.start).getTime();
    const end = new Date(m.planned_period.end).getTime();
    // Running right now (covers multi-day windows that started earlier).
    if (!Number.isNaN(start) && !Number.isNaN(end) && start <= nowMs && nowMs <= end) {
      return true;
    }
    // Otherwise it must START today or tomorrow (UTC).
    return !Number.isNaN(start) && start >= today && start < dayAfterTomorrow;
  });
  candidates.sort((a, b) => {
    // In-progress always leads.
    const aProg = a.status === "in_progress" ? 0 : 1;
    const bProg = b.status === "in_progress" ? 0 : 1;
    if (aProg !== bProg) return aProg - bProg;
    return new Date(a.planned_period.start).getTime() - new Date(b.planned_period.start).getTime();
  });
  return candidates.slice(0, limit);
}
