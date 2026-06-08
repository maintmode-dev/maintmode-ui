"use client";

import { useQuery } from "@tanstack/react-query";

import { bffFetch, BffError } from "@/features/_shared/api/bff-fetch";
import { DATA_SOURCE } from "@/features/_shared/api/data-source";
import { MOCK_MAINTENANCES } from "@/shared/mock/maintenances";
import type { Maintenance } from "@/domain/maintenance/maintenance";

export interface CalendarQueryParams {
  /** Inclusive window start as `YYYY-MM-DD` (backend `from`). */
  from: string;
  /** Inclusive window end as `YYYY-MM-DD` (backend `to`, expanded to end-of-day). */
  to: string;
}

interface CalendarResponse {
  items: Maintenance[];
}

export function calendarKey(p: CalendarQueryParams) {
  return ["calendar", p.from, p.to] as const;
}

export function useCalendarQuery(params: CalendarQueryParams) {
  return useQuery({
    queryKey: calendarKey(params),
    queryFn: async (): Promise<Maintenance[]> => {
      if (DATA_SOURCE.calendar === "mock") {
        return MOCK_MAINTENANCES;
      }
      const url = `/api/calendar?from=${encodeURIComponent(params.from)}&to=${encodeURIComponent(params.to)}`;
      const data = await bffFetch<CalendarResponse>(url);
      return data.items;
    },
    staleTime: 30_000,
    // Don't hammer the backend on auth/permission failures: a 401 means the
    // session is dead (bffFetch already redirects to /login), and a 403 is
    // terminal. Retrying those just amplifies a bad state.
    retry: (failureCount, error) => {
      if (error instanceof BffError && (error.status === 401 || error.status === 403)) {
        return false;
      }
      return failureCount < 1;
    },
  });
}
