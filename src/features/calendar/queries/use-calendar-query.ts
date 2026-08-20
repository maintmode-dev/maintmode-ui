"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

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
 *
 * Exported because the neighbour prefetch reads entries of this shape back out
 * of the cache; it must not restate the shape itself, or the two declarations
 * drift the same way this comment warns about.
 */
export interface CalendarResponse {
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
 * The ONE implementation of the calendar wire call, shared by the query below
 * and by the neighbour prefetch (`use-calendar-prefetch.ts`).
 *
 * It is exported rather than left inline because `prefetchQuery` needs a
 * `queryFn` too, and a second copy of this function is exactly the drift the
 * repo's contract policy exists to prevent: two implementations of one wire
 * call agree with each other right up until one of them is edited. Everything
 * here is load-bearing for that sharing:
 *
 *   - the `mock` branch, or a prefetch would hit the network in mock mode;
 *   - `items ?? []`, or a prefetched entry could hold `items: undefined` where a
 *     queried one holds `[]`, and the two entries would no longer be the same
 *     shape;
 *   - returning the whole envelope (not just `items`), because the envelope IS
 *     what the query caches: `meta` is destructured out of it alongside `items`
 *     so the two cannot describe different responses — see `useCalendarQuery`.
 *     A prefetch that stored only `items` would write an entry of a different
 *     shape, and the step into that window would find no `meta` at all.
 *
 * `background` marks a call nobody is waiting on — today, the neighbour
 * prefetch. It changes exactly one thing: how a dead session is handled. See
 * the note below.
 */
export async function fetchCalendar(
  params: CalendarQueryParams,
  { background = false }: { background?: boolean } = {},
): Promise<CalendarResponse> {
  if (DATA_SOURCE.calendar === "mock") {
    return { items: MOCK_CALENDAR_EVENTS };
  }
  const search = new URLSearchParams({ from: params.from, to: params.to });
  appendFilter(search, "channel_ids", params.channelIds);
  appendFilter(search, "resource_ids", params.resourceIds);
  appendFilter(search, "statuses", params.statuses);
  const data = await bffFetch<CalendarResponse>(`/api/calendar?${search.toString()}`, {
    // A foreground call that meets a dead session must NOT reject: `bffFetch`
    // redirects to /login and returns a promise that never settles, so the UI
    // cannot flash an error state during the navigation away. That is right for
    // a request someone is looking at, and wrong for one nobody is: an
    // unsettled background call leaves its cache entry `fetching` forever, and
    // TanStack hands that same hung promise to the next real request for the
    // window (`query.ts` returns the in-flight retryer's promise instead of
    // starting a fetch). The operator would then step into that window and see
    // the previous one's events under the new date, with no spinner, because
    // `keepPreviousData` is holding them and nothing reads as pending.
    //
    // So background calls opt out of the redirect and take the plain rejection.
    // The entry lands in `error`, which is inert: nothing renders it, and the
    // next foreground request starts cleanly. The redirect is not lost — the
    // foreground query hits the same 401 and performs it.
    skipAuthRedirect: background,
  });
  return { items: data.items ?? [], ...(data.meta ? { meta: data.meta } : {}) };
}

/**
 * Keeps the resolved `data` a bare `CalendarEvent[]` — the shape all three call
 * sites read (`calendar-page.tsx` plus the resource/channel related feeds via
 * `use-related-maintenance-query`) — while surfacing the truncation `meta`
 * alongside it. Folding `meta` into `data` would force every one of those call
 * sites, and the mocks pinning them, to change for a field only the calendar
 * page reads.
 *
 * ## `meta` and `items` come from one envelope, by construction
 *
 * `meta` used to be read out-of-band with `client.getQueryData(...)` during
 * render, with a comment claiming the two could not drift apart. They could.
 * A plain read is not a subscription, and it only stayed correct because the
 * hook happened to `{...query}`-spread its result: the spread touches every
 * getter on TanStack's tracked-props proxy, which subscribes the consumer to
 * fields like `dataUpdatedAt` and so guarantees a re-render on every settle.
 *
 * Narrow that return object — an innocuous-looking refactor — and the guarantee
 * evaporates. `QueryObserver.updateResult` gates notification twice: after
 * `shallowEqualObjects`, `shouldNotifyListeners` only notifies when a field the
 * consumer actually READ has changed. So a response whose `items` are
 * structurally identical (structural sharing preserves the array reference)
 * changes no tracked prop, React skips the re-render, and the out-of-band read
 * never re-runs. Measured on the pre-fix implementation with a narrowed return:
 * the consumer showed `{count: 1, truncated: false}` while the cache held
 * `{count: 1000, truncated: true}` — a truncated window reported as complete,
 * which is the silent hiding RUK-252 exists to close.
 *
 * Deriving both fields from ONE envelope removes the dependency on that
 * accident: the envelope is what the observer diffs, so a `meta` change IS a
 * `data` change and cannot be missed.
 */
export function useCalendarQuery(params: CalendarQueryParams, options: CalendarQueryOptions = {}) {
  const query = useQuery({
    queryKey: calendarKey(params),
    enabled: options.enabled ?? true,
    queryFn: () => fetchCalendar(params),
    // No `select`. It used to unwrap the envelope to `response.items`, which is
    // exactly what put `meta` outside the observer's view; keeping the envelope
    // as the query's own data makes a meta-only change a data change, so the
    // observer cannot miss it. The unwrapping now happens below, after the
    // observer has done its diffing.
    //
    // TanStack's `replaceEqualDeep` still runs on the cached envelope, so a
    // meta-only response hands back a new wrapper whose `.items` is the OLD
    // array reference — which is what stops such a change rebuilding every
    // FullCalendar event downstream (`items` → `filteredItems` → `events`).
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

  // Split the envelope back apart. `data` keeps the `CalendarEvent[]` shape the
  // call sites read; `meta` rides alongside, out of the same envelope — so the
  // two cannot describe different responses.
  //
  // `meta` is dropped while the shown data is PLACEHOLDER data. During a step to
  // a new window `keepPreviousData` keeps the previous window's `items` on
  // screen, and its `meta` would come with them — so the truncation notice would
  // render the previous window's COUNT against the new date header. That number
  // is shown verbatim to the operator ("Showing the first N maintenances"), and
  // `calendar-truncation-notice.tsx` states the rule it would break: a
  // confidently wrong count is worse than the silent truncation the notice
  // closes. `undefined` here means "unknown", which the notice renders as
  // nothing — matching the behaviour before this change exactly.
  // Optional chain because `query.data` is undefined until the first response.
  // Deliberately NOT defaulted to `[]`: that would make "not loaded yet"
  // indistinguishable from "loaded, and the window is empty", and the call sites
  // branch on `isPending` to tell those apart. `fetchCalendar` already
  // normalises `items` to `[]`, so a settled envelope always carries an array —
  // the chain covers the pre-first-response commits, not a malformed payload.
  const data = query.data?.items;
  const meta = query.isPlaceholderData ? undefined : query.data?.meta;

  // NOTE for the next caller: overriding `data` on the spread flattens
  // TanStack's discriminated union, so `isSuccess` no longer narrows `data` to
  // non-undefined (verified: `if (q.isSuccess) q.data.length` fails TS18048).
  // Every consumer today writes `query.data ?? []`, so nothing is broken —
  // but reach for `isSuccess`-narrowing here and it will not work.
  return { ...query, data, meta };
}
