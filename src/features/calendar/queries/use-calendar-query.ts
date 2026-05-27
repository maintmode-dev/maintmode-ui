"use client";

import { useQuery } from "@tanstack/react-query";

import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { DATA_SOURCE } from "@/features/_shared/api/data-source";
import { MOCK_MAINTENANCES } from "@/shared/mock/maintenances";
import type { Maintenance } from "@/domain/maintenance/maintenance";

export interface CalendarQueryParams {
  weekStart: string; // ISO date
  weekEnd: string; // ISO date
}

interface CalendarResponse {
  items: Maintenance[];
}

export function calendarKey(p: CalendarQueryParams) {
  return ["calendar", p.weekStart, p.weekEnd] as const;
}

export function useCalendarQuery(params: CalendarQueryParams) {
  return useQuery({
    queryKey: calendarKey(params),
    queryFn: async (): Promise<Maintenance[]> => {
      if (DATA_SOURCE.calendar === "mock") {
        return MOCK_MAINTENANCES;
      }
      const url = `/api/calendar?week_start=${encodeURIComponent(params.weekStart)}&week_end=${encodeURIComponent(params.weekEnd)}`;
      const data = await bffFetch<CalendarResponse>(url);
      return data.items;
    },
    staleTime: 30_000,
  });
}
