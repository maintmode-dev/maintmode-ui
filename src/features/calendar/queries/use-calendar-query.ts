"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { bffFetch, BffError } from "@/features/_shared/api/bff-fetch";
import { DATA_SOURCE } from "@/features/_shared/api/data-source";
import { MOCK_MAINTENANCES } from "@/shared/mock/maintenances";
import type { Maintenance } from "@/domain/maintenance/maintenance";

export interface CalendarQueryParams {
  /** Inclusive window start as `YYYY-MM-DD` (backend `from`). */
  from: string;
  /** Inclusive window end as `YYYY-MM-DD` (backend `to`, expanded to end-of-day). */
  to: string;
  /**
   * Notify-channel ids to filter by (backend `channel_ids`). Returns
   * only maintenances that notify at least one of these channels — powers the
   * ChannelDetailPage "Related maintenance" section. Omit for the full calendar.
   */
  channelIds?: string[];
  /**
   * Resource ids to filter by (backend `resource_ids`). Returns only
   * maintenances scoped to at least one of these resources — powers the
   * ResourceDetailPage "Related maintenance" section. Omit for the full calendar.
   */
  resourceIds?: string[];
  /**
   * Statuses to keep (backend `statuses`, repeated). The backend filters by
   * status server-side (verified), so the calendar sends its active status set
   * here instead of filtering client-side — that keeps `items` equal to what the
   * grid shows on the status axis. Omit (or pass empty) for all statuses.
   * NOTE: `scope` is intentionally NOT a query param — the backend ignores it,
   * so scope stays a client-side filter (see calendar-filters.ts).
   */
  statuses?: string[];
}

interface CalendarResponse {
  items: Maintenance[];
}

export function calendarKey(p: CalendarQueryParams) {
  return [
    "calendar",
    p.from,
    p.to,
    {
      channelIds: p.channelIds ?? [],
      resourceIds: p.resourceIds ?? [],
      // Sort so the key is stable regardless of the status set's insertion order
      // (toggling chips builds the array in different orders) — equivalent
      // filters must share a cache entry instead of refetching.
      statuses: [...(p.statuses ?? [])].sort(),
    },
  ] as const;
}

export interface CalendarQueryOptions {
  /**
   * Gate the request. Defaults to `true` — pass `false` while the caller's
   * `params` are still provisional, so no fetch goes out for a window that is
   * about to be replaced. The calendar page uses this: it renders SSR-safe
   * defaults first and only learns the stored view/filters after mount, so
   * firing on the first render would spend a request on a window nobody reads
   * (see calendar-page.tsx). Callers whose params are correct from the first
   * render (the resource/channel detail pages) omit it.
   *
   * NOTE: a disabled query stays `isPending` — it never resolves on its own.
   * Only gate on a flag that is guaranteed to flip, or the caller's loading
   * state never ends.
   */
  enabled?: boolean;
}

export function useCalendarQuery(params: CalendarQueryParams, options: CalendarQueryOptions = {}) {
  return useQuery({
    queryKey: calendarKey(params),
    enabled: options.enabled ?? true,
    queryFn: async (): Promise<Maintenance[]> => {
      if (DATA_SOURCE.calendar === "mock") {
        return MOCK_MAINTENANCES;
      }
      const search = new URLSearchParams({ from: params.from, to: params.to });
      for (const channelId of params.channelIds ?? []) {
        if (channelId) search.append("channel_ids", channelId);
      }
      for (const resourceId of params.resourceIds ?? []) {
        if (resourceId) search.append("resource_ids", resourceId);
      }
      for (const status of params.statuses ?? []) {
        if (status) search.append("statuses", status);
      }
      const data = await bffFetch<CalendarResponse>(`/api/calendar?${search.toString()}`);
      return data.items;
    },
    staleTime: 30_000,
    // Keep the previous window's data on screen while the next one loads, so
    // stepping prev/next (or switching view) doesn't unmount the grid and flash
    // the `CalendarLoading` skeleton ("Day 1/2/3…") on every navigation. The
    // full skeleton then only shows on the very first load (no prior data).
    placeholderData: keepPreviousData,
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
