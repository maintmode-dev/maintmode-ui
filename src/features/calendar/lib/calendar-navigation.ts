import type { MaintenanceScope, MaintenanceStatus } from "@/domain/maintenance/models/maintenance";

export type CalendarViewMode = "day" | "week" | "month";
export type CalendarScopeFilter = "all" | MaintenanceScope;

export type CalendarFilterState = {
  view: CalendarViewMode;
  date: string; // YYYY-MM-DD local-date
  scope: CalendarScopeFilter;
  statuses: MaintenanceStatus[];
  resourceIds: string[];
};

const VALID_VIEW_MODES: readonly CalendarViewMode[] = ["day", "week", "month"];
const VALID_SCOPES: readonly CalendarScopeFilter[] = ["all", "global", "resource"];
const VALID_STATUSES: readonly MaintenanceStatus[] = [
  "draft",
  "planned",
  "in_progress",
  "completed",
  "canceled",
];

export function formatLocalDateParam(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalDateParam(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export function parseCalendarSearchParams(searchParams: URLSearchParams): CalendarFilterState {
  const view = readEnum<CalendarViewMode>(searchParams.get("view"), VALID_VIEW_MODES) ?? "month";
  const dateParam = parseLocalDateParam(searchParams.get("date"));
  const date = dateParam ? formatLocalDateParam(dateParam) : formatLocalDateParam(new Date());
  const scope = readEnum<CalendarScopeFilter>(searchParams.get("scope"), VALID_SCOPES) ?? "all";
  const statuses = readMulti(searchParams, "statuses").filter(
    (status): status is MaintenanceStatus => (VALID_STATUSES as readonly string[]).includes(status),
  );
  const resourceIds = readMulti(searchParams, "resource_ids");
  return { view, date, scope, statuses, resourceIds };
}

export function buildCalendarSearchParams(state: CalendarFilterState): URLSearchParams {
  const params = new URLSearchParams();
  params.set("view", state.view);
  params.set("date", state.date);
  if (state.scope !== "all") {
    params.set("scope", state.scope);
  }
  for (const status of uniqueSorted(state.statuses)) {
    params.append("statuses", status);
  }
  for (const resourceId of uniqueSorted(state.resourceIds)) {
    params.append("resource_ids", resourceId);
  }
  return params;
}

/**
 * Inclusive `[from, to]` calendar window expressed in local-date strings,
 * matching the backend `/ui/v1/calendar` `from`/`to` query contract.
 *
 * - `day`: just the requested day.
 * - `week`: Monday-to-Sunday window that contains the requested day.
 * - `month`: full calendar grid (Mon..Sun rows) that contains the requested
 *   month. The grid extends into the previous and next month so that month-view
 *   cells never show partial data.
 */
export function calendarRangeForView(view: CalendarViewMode, anchor: Date): {
  from: string;
  to: string;
} {
  if (view === "day") {
    return { from: formatLocalDateParam(anchor), to: formatLocalDateParam(anchor) };
  }
  if (view === "week") {
    const monday = startOfWeek(anchor);
    const sunday = addDays(monday, 6);
    return { from: formatLocalDateParam(monday), to: formatLocalDateParam(sunday) };
  }
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const lastOfMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const gridStart = startOfWeek(firstOfMonth);
  const gridEndAnchor = startOfWeek(lastOfMonth);
  const gridEnd = addDays(gridEndAnchor, 6);
  return { from: formatLocalDateParam(gridStart), to: formatLocalDateParam(gridEnd) };
}

function startOfWeek(date: Date): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay(); // 0 = Sunday, 1 = Monday, ...
  const offsetToMonday = (day + 6) % 7;
  copy.setDate(copy.getDate() - offsetToMonday);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function readEnum<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  if (value && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  return null;
}

function readMulti(searchParams: URLSearchParams, key: string): string[] {
  const values = searchParams
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  return uniqueSorted(values);
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}
