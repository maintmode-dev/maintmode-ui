"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { stepAnchor, toDateParam, viewRange, type CalendarView } from "../view-range";
import { calendarKey, fetchCalendar, type CalendarQueryParams } from "./use-calendar-query";

/**
 * Which way the operator last stepped. `null` means "we don't know", and that is
 * a real state rather than a missing value: on a cold load, after `Today`, and
 * after a view switch there is no meaningful neighbour to guess at.
 */
export type StepDirection = 1 | -1 | null;

interface NeighbourPrefetchArgs {
  /** The CURRENT query params, whole — the neighbour key is built from these. */
  params: CalendarQueryParams;
  view: CalendarView;
  /**
   * The anchor **of the window in `params`**, not the page's live anchor.
   *
   * The distinction is the whole correctness of this hook. During the quiet
   * period the page's anchor has already moved and the request has not, so an
   * anchor taken straight from the page describes a different window than
   * `params` does — and the prefetch then warms the window after next while the
   * operator steps into the one before it. Anchors cannot be re-derived from
   * `params.from` either: in Month view `from` is the grid's leading Monday,
   * which usually belongs to the previous month.
   */
  anchor: Date;
  direction: StepDirection;
  /** Hydrated, and the visible window has settled. */
  enabled: boolean;
}

/**
 * Warm the neighbouring window once the current one has settled, so the next
 * step lands on a cache hit.
 *
 * Why this is worth doing at all: a forward step is a guaranteed miss. Each
 * window is its own cache key, so the key for "next" has never been fetched, and
 * `staleTime` cannot help — it only ever spares a *return* to a window already
 * seen. Prefetching is the only thing that turns the forward path warm.
 *
 * Why it is worth only this much: the response is a small share of the wait
 * (layout dominates, see docs/perf/wave-2.md). This shortens the delivery of a
 * window, it does not make rendering one cheaper — so it must not be reported as
 * an interaction-latency fix.
 *
 * ### One direction, and only when it is known
 *
 * Prefetching both neighbours would double request volume to warm a window the
 * operator usually won't open. Prefetching a *default* direction would be worse:
 * an operator who opens the calendar and never steps would silently pay an extra
 * request, and the cold load would stop being the single request the hydration
 * tests pin. So `direction: null` prefetches nothing, deliberately.
 */
export function useCalendarNeighbourPrefetch({
  params,
  view,
  anchor,
  direction,
  enabled,
}: NeighbourPrefetchArgs): void {
  const client = useQueryClient();

  useEffect(() => {
    if (!enabled || direction === null) return;

    // Step from the anchor OF THE REQUESTED WINDOW (see the prop's note): with
    // the page's live anchor this warmed N+2 while the operator stepped into
    // N+1 — spending a request, missing the window it was meant to warm, and
    // racing ahead of the real one because the debounce means nothing is in
    // flight yet.
    const neighbourAnchor = stepAnchor(view, anchor, direction);
    const range = viewRange(view, neighbourAnchor);
    // Spread the CURRENT params and swap only the window. Rebuilding the params
    // from scratch here is how the prefetch key silently drifts from the query
    // key: `calendarKey` also hashes `statuses` (and any filter added later), so
    // a hand-built `{from, to}` would warm an entry the step never reads — and
    // would ask the backend for every status while doing it.
    const neighbour: CalendarQueryParams = {
      ...params,
      from: toDateParam(range.from),
      to: toDateParam(range.to),
    };

    const run = () => {
      void client.prefetchQuery({
        queryKey: calendarKey(neighbour),
        // `background`: nobody is waiting on this one, so a dead session must
        // reject here rather than hang. See the note in `fetchCalendar` — a
        // never-settling prefetch gets handed to the next real request for the
        // window and strands it pending.
        queryFn: () => fetchCalendar(neighbour, { background: true }),
        // Not to keep the warmed entry fresh — `staleTime` is an observer
        // option and does not travel with the cached data; the freshness of the
        // step that follows is decided by `useCalendarQuery`'s own `staleTime`.
        // It is passed for the one thing it does here: skip this network call
        // when the entry is already fresh enough.
        staleTime: 30_000,
      });
    };

    // Run when the browser is idle so the warm-up never competes with the window
    // the operator is actually looking at. `requestIdleCallback` is absent in
    // Safari (and in jsdom), hence the timeout fallback.
    //
    // BOTH halves of the pair are required before taking the idle branch. With
    // only `requestIdleCallback` available the callback could be scheduled and
    // never cancelled, and cancellation is not a nicety here: it is what stops a
    // burst leaving one orphaned prefetch per window walked past, handing back
    // much of what the debounce just saved. The timeout fallback always cancels,
    // so it is the safer branch when the pair is incomplete.
    const idle = typeof window !== "undefined" ? window.requestIdleCallback : undefined;
    const cancelIdle = typeof window !== "undefined" ? window.cancelIdleCallback : undefined;
    if (typeof idle === "function" && typeof cancelIdle === "function") {
      const handle = idle(run);
      return () => cancelIdle(handle);
    }
    const handle = setTimeout(run, 0);
    return () => clearTimeout(handle);
  }, [client, params, view, anchor, direction, enabled]);
}
