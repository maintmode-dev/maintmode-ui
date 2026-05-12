import {
  calendarRangeForView,
  parseLocalDateParam,
  type CalendarFilterState,
} from "@/features/calendar/lib/calendar-navigation";

export type ResolvedCalendarRange = { from: string; to: string };

/**
 * React Query keys for the calendar feature. Everything hangs off a single
 * `calendar` root so one
 * `invalidateQueries({ queryKey: calendarQueryKeys.all })` call refreshes
 * every active calendar query after a mutation.
 *
 * The list key is keyed by the resolved `{from, to}` range — not by
 * `state.date` — so navigating inside the same week/month grid hits the
 * cache instead of triggering a refetch.
 */
export const calendarQueryKeys = {
  all: ["calendar"] as const,
  list: (state: CalendarFilterState) => {
    const { from, to } = resolveCalendarRange(state);
    return [
      ...calendarQueryKeys.all,
      "list",
      state.view,
      from,
      to,
      state.scope,
      [...state.statuses].sort().join(","),
      [...state.resourceIds].sort().join(","),
    ] as const;
  },
};

export function resolveCalendarRange(state: CalendarFilterState): ResolvedCalendarRange {
  const anchor = parseLocalDateParam(state.date) ?? new Date();
  return calendarRangeForView(state.view, anchor);
}
