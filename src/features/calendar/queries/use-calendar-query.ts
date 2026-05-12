"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { MaintenanceSummary } from "@/domain/maintenance/models/maintenance";
import type { Resource } from "@/domain/resource/models/resource";
import { bffFetch } from "@/features/_shared/api/bff-fetch";
import type { CalendarFilterState } from "@/features/calendar/lib/calendar-navigation";
import { calendarQueryKeys, resolveCalendarRange } from "@/features/calendar/queries/query-keys";

export type CalendarQueryResponse = {
  maintenances: MaintenanceSummary[];
  resources: Resource[];
  meta: { count: number; truncated: boolean };
};

export function useCalendarQuery(state: CalendarFilterState) {
  return useQuery({
    queryKey: calendarQueryKeys.list(state),
    queryFn: async ({ signal }) => fetchCalendar(state, signal),
    staleTime: 30_000,
    // Keep the previously rendered grid visible while the next view's data is
    // loading. Avoids a flash of skeleton on day↔week↔month switches.
    placeholderData: keepPreviousData,
  });
}

async function fetchCalendar(state: CalendarFilterState, signal: AbortSignal | undefined) {
  const { from, to } = resolveCalendarRange(state);
  const params = new URLSearchParams();
  params.set("from", from);
  params.set("to", to);
  if (state.scope !== "all") {
    params.set("scope", state.scope);
  }
  for (const status of state.statuses) {
    params.append("statuses", status);
  }
  for (const resourceId of state.resourceIds) {
    params.append("resource_ids", resourceId);
  }
  return bffFetch<CalendarQueryResponse>(`/api/maintenance?${params.toString()}`, {
    method: "GET",
    signal,
  });
}
