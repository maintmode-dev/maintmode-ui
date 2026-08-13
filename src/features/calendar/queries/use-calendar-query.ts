"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";

import { bffFetch, BffError } from "@/features/_shared/api/bff-fetch";
import { DATA_SOURCE } from "@/features/_shared/api/data-source";
import { MOCK_CALENDAR_EVENTS } from "@/shared/mock/maintenances";
import type { CalendarEvent } from "@/domain/maintenance/maintenance";

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

/**
 * Truncation signal from the backend's `uimodels.CalendarViewMeta`, forwarded
 * verbatim by the `/api/calendar` route. The backend caps the calendar at 1000
 * events; `truncated` says the window hit that cap and `count` is how many came
 * back. Optional throughout — a backend that sends no `meta` must not be
 * mistaken for one reporting a complete window, so consumers should treat
 * `undefined` as "unknown", not as "not truncated".
 */
export interface CalendarMeta {
  count?: number;
  truncated?: boolean;
}

/**
 * The client's OWN declaration of what `/api/calendar` returns. Nothing type-
 * checks it against `route.ts` — `NextResponse.json()` is untyped and `bffFetch`
 * takes this shape on trust — so the two agree only because someone keeps them
 * in step. When the BFF's projection changes, this line has to change with it or
 * the app compiles happily against a shape that no longer arrives (RUK-258).
 */
interface CalendarResponse {
  items: CalendarEvent[];
  meta?: CalendarMeta;
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

/**
 * Append a repeated filter param, skipping empty ids so a stray "" can't turn
 * into a filter the backend then matches nothing against. Omitted/empty arrays
 * append nothing, which is what "no filter on this axis" means on the wire.
 */
function appendFilter(search: URLSearchParams, key: string, values: string[] | undefined): void {
  for (const value of values ?? []) {
    if (value) search.append(key, value);
  }
}

/**
 * `meta` is carried OUT-OF-BAND rather than by widening what the query resolves
 * to. `data` stays `CalendarEvent[]`, which is what all three call sites read
 * (`calendar-page.tsx` plus the resource/channel related feeds via
 * `use-related-maintenance-query`); folding it into an object would have forced
 * every one of them — and the mocks pinning them — to change for a field only
 * the calendar page will read.
 *
 * The `select` below keeps `data` an array while the raw envelope stays in the
 * cache, so `meta` and `items` always come from the SAME response: they cannot
 * drift apart across a refetch, and `keepPreviousData` carries both together.
 */
export function useCalendarQuery(params: CalendarQueryParams, options: CalendarQueryOptions = {}) {
  const query = useQuery({
    queryKey: calendarKey(params),
    enabled: options.enabled ?? true,
    queryFn: async (): Promise<CalendarResponse> => {
      if (DATA_SOURCE.calendar === "mock") {
        return { items: MOCK_CALENDAR_EVENTS };
      }
      const search = new URLSearchParams({ from: params.from, to: params.to });
      appendFilter(search, "channel_ids", params.channelIds);
      appendFilter(search, "resource_ids", params.resourceIds);
      appendFilter(search, "statuses", params.statuses);
      const data = await bffFetch<CalendarResponse>(`/api/calendar?${search.toString()}`);
      return { items: data.items ?? [], ...(data.meta ? { meta: data.meta } : {}) };
    },
    // Unwrap to the array the call sites expect. `select` runs on the cached
    // envelope, so it re-derives (and stays referentially stable per response)
    // without the envelope leaking into `data`.
    select: (response: CalendarResponse) => response.items,
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

  // The truncation signal, read off the same cache entry that produced `data`.
  // Keeping it out of `data` is what lets the resolved type stay
  // `CalendarEvent[]` for the existing call sites.
  //
  // Read plainly on every render rather than memoized: `useQuery` above already
  // re-renders this hook whenever the entry settles, so the read is always
  // current. Caching it behind a stale dependency list is exactly how `meta`
  // would drift out of step with `items` across a refetch.
  //
  // While a NEW window is fetching, `keepPreviousData` still shows the previous
  // `items` but this returns `undefined` (no entry under the new key yet). That
  // is the safe direction: `undefined` means "unknown", never a false
  // "not truncated".
  const client = useQueryClient();
  const meta = client.getQueryData<CalendarResponse>(calendarKey(params))?.meta;

  return { ...query, meta };
}
