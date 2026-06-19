/**
 * Pure client-side filter model for the calendar sidebar. The calendar query
 * returns the full `Maintenance[]` for the visible window; the sidebar narrows
 * that set by status, scope, and touched resources before the grids render it.
 *
 * Kept free of React so the predicate is unit-testable without mounting the
 * sidebar — the page owns the `CalendarFilterState` and passes the result of
 * `applyCalendarFilters` to the Day/Week/Month grids.
 */

import type { Maintenance, MaintenanceScope, MaintenanceStatus } from "@/domain/maintenance/maintenance";

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
  /** Resource ids that must intersect a maintenance's `resources`. Empty = no resource filter. */
  resourceIds: Set<string>;
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
    resourceIds: new Set(),
  };
}

/** localStorage key for the persisted status/scope selections. */
export const FILTERS_STORAGE_KEY = "maintmode.calendar.filters";

/**
 * Serializable slice of the filter state we persist across refresh/logout:
 * `statuses` + `scope`. `resourceIds` is deliberately NOT persisted — it's a
 * picker scoped to whatever resources happen to be in the current window, so a
 * stored id would silently filter to nothing in a different window/session.
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
 * unexpected, with `resourceIds` always reset to empty. SSR-safe (no `window`).
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
      resourceIds: new Set(),
    };
  } catch {
    return fallback;
  }
}

/** True when a maintenance passes every active filter dimension. */
export function matchesFilters(m: Maintenance, f: CalendarFilterState): boolean {
  if (!f.statuses.has(m.status)) return false;
  if (f.scope !== "all" && m.scope !== f.scope) return false;
  if (f.resourceIds.size > 0) {
    const touches = m.resources.some((r) => f.resourceIds.has(r.id));
    if (!touches) return false;
  }
  return true;
}

export function applyCalendarFilters(items: Maintenance[], f: CalendarFilterState): Maintenance[] {
  return items.filter((m) => matchesFilters(m, f));
}

export interface ResourceOption {
  id: string;
  name: string;
  type?: string;
}

/**
 * Distinct resources present across the loaded maintenances, sorted by name.
 * Drives the resource search/picker so the rail only offers resources that
 * actually appear in the current window (no extra catalog fetch needed).
 */
export function resourceOptions(items: Maintenance[]): ResourceOption[] {
  const byId = new Map<string, ResourceOption>();
  for (const m of items) {
    for (const r of m.resources) {
      if (!byId.has(r.id)) byId.set(r.id, { id: r.id, name: r.name, type: r.type });
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The next upcoming maintenances for the "Up next" panel: anything not yet
 * finished (in_progress, or starting at/after `now`), soonest first. In-progress
 * sorts first; the rest by planned start. Excludes draft/completed/canceled —
 * the panel is an operational "what's next" list, not an archive.
 */
export function upcomingItems(items: Maintenance[], now: Date, limit = 5): Maintenance[] {
  const nowMs = now.getTime();
  const candidates = items.filter((m) => {
    if (m.status === "in_progress") return true;
    if (m.status !== "planned") return false;
    const end = new Date(m.planned_period.end).getTime();
    return Number.isNaN(end) || end >= nowMs;
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
