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

/** Scope filter: `all` shows both, otherwise restrict to one `MaintenanceScope`. */
export type ScopeFilter = "all" | MaintenanceScope;

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

/** The five statuses, in lifecycle order, for rendering chips. */
export const STATUS_ORDER: MaintenanceStatus[] = [
  "planned",
  "in_progress",
  "draft",
  "completed",
  "canceled",
];

export function defaultFilterState(): CalendarFilterState {
  return {
    statuses: new Set(DEFAULT_STATUSES),
    scope: "all",
    resourceIds: new Set(),
  };
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
