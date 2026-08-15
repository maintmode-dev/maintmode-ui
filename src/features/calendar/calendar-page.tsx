"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { canWrite } from "@/domain/auth/permissions";
import { CalendarEmpty, CalendarError, CalendarLoading } from "@/shared/ui/states";
import { Button } from "@/shared/ui/shadcn/button";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/shadcn/tabs";
import { useDelayedFlag } from "@/features/_shared/hooks/use-delayed-flag";

import { CalendarSidebar } from "./calendar-sidebar";
import { CalendarStaleWindowNotice } from "./calendar-stale-window-notice";
import { CalendarTruncationNotice } from "./calendar-truncation-notice";
import {
  applyCalendarFilters,
  defaultFilterState,
  readStoredFilters,
  serializeFilters,
  FILTERS_STORAGE_KEY,
} from "./calendar-filters";
import { calendarKey, useCalendarQuery } from "./queries/use-calendar-query";
import { useCalendarWindow, sameWindow } from "./queries/use-calendar-window";
import { useCalendarNeighbourPrefetch, type StepDirection } from "./queries/use-calendar-prefetch";
import { useTimezone } from "@/features/_shared/timezone/use-timezone";
import { useMeQuery } from "@/features/_shared/queries/use-me-query";
import {
  anchorFor,
  anchorOnViewSwitch,
  periodTitle,
  stepAnchor,
  toDateParam,
  viewRange,
  type CalendarView as View,
} from "./view-range";

const VIEW_STORAGE_KEY = "maintmode.calendar.view";
const DEFAULT_VIEW: View = "day";

/**
 * How long the grid may show another window's events before we say so.
 *
 * Stepping keeps the previous window on screen while the next loads, which is
 * right for the few hundred ms an ordinary step takes and wrong once it lasts:
 * the operator reads one period's dates over another period's work (RUK-267).
 *
 * The number is a judgement call, not a measurement (RUK-257 owns the real
 * trace). It is measured from when the REQUEST starts, and the request is itself
 * debounced by up to `MAX_WAIT_MS` (1000) — so the worst case from click to
 * banner is ~2.5s, not 1.5s. That is accepted deliberately: the property worth
 * protecting most is that a HEALTHY step never shows the banner, because a
 * warning that fires on every chevron click is one operators learn to ignore.
 *
 * This is the tuning knob if it ever proves noisy. Note it has no "off" value —
 * turning the feature off is a revert, not a retune.
 */
export const STALE_NOTICE_DELAY_MS = 1500;

export interface CalendarPageProps {
  /**
   * Test seam for {@link STALE_NOTICE_DELAY_MS}. Production never passes it.
   *
   * It exists because the tests for this banner have to run on REAL timers: the
   * request is debounced, and a fake-timer `act` block that wraps a long sleep
   * does not let that debounce flush — the request goes out when the block ends,
   * so the sequence collapses and the state under test is never observed. Real
   * timers with the shipped 1500 ms would put seconds of wall clock into every
   * one of those tests.
   */
  staleNoticeDelayMs?: number;
}

/**
 * Loaded on demand: FullCalendar + Luxon is 97.9 KB gzip against the whole
 * route's 202.4 KB own JS — statically imported it sat on the critical path of
 * the app's DEFAULT route, and the browser had to parse it before it could even
 * issue the calendar data request.
 *
 * `ssr: false` costs nothing: the query is `enabled: hydrated`, `hydrated` only
 * flips in the mount effect below, so on the server `isPending` is true and the
 * page returns `CalendarLoading` — the `renderGrid` branch is unreachable
 * server-side (verified against the built HTML, byte-identical).
 *
 * No `loading` placeholder on purpose: the grid never renders into empty space.
 * It replaces either `CalendarLoading` or the static gradient backdrop below,
 * which deliberately matches the grid's exact height. A placeholder would
 * insert a THIRD visual state. The mount-effect prefetch covers the fetch.
 */
const CalendarGrid = dynamic(() => import("./calendar-grid").then((m) => m.CalendarGrid), {
  ssr: false,
});

/**
 * Loaded on demand, exactly as `/approvals` already does with this same
 * component — 12 KB gzip that every calendar viewer downloaded and parsed,
 * including those who never open an event.
 *
 * `ssr: false` costs nothing only BECAUSE the render site below is gated on
 * `selectedId !== null`. Without that gate this renders unconditionally and
 * `next/dynamic` emits a client-bailout placeholder into every server render of
 * the route — `selectedId` starting null does not prevent that, and Radix
 * unmounting closed content is a DOM concern, not an SSR one. The two are easy
 * to conflate; the gate is what makes the claim true.
 */
const MaintenanceQuickSheet = dynamic(
  () => import("@/features/maintenance/maintenance-quick-sheet").then((m) => m.MaintenanceQuickSheet),
  { ssr: false },
);

/** Read the last-used view from localStorage (survives refresh + logout). */
function readStoredView(): View {
  if (typeof window === "undefined") return DEFAULT_VIEW;
  const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
  return stored === "day" || stored === "week" || stored === "month" ? stored : DEFAULT_VIEW;
}

export function CalendarPage({ staleNoticeDelayMs = STALE_NOTICE_DELAY_MS }: CalendarPageProps = {}) {
  // Server-render the default view, then adopt the stored view after mount —
  // reading localStorage during render would diverge from SSR and cause a
  // hydration mismatch. `hydrated` gates persistence so the stored value isn't
  // overwritten by the default before it's read back, AND gates the calendar
  // query: until the stored view/filters are known, `range`/`statusParam` still
  // hold the defaults, so fetching would spend a request on a window that the
  // very next render replaces (a Day+default-statuses call whose response is
  // never read). Gating costs nothing — the real request is already triggered
  // by the same mount effect, so it goes out no later than it did before.
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [anchor, setAnchor] = useState(() => anchorFor(DEFAULT_VIEW, new Date()));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState(defaultFilterState);
  const [hydrated, setHydrated] = useState(false);
  // Which way the operator last stepped, and so which neighbour is worth
  // warming. `null` means "we don't know" — the honest state on a cold load,
  // after Today, and after a view switch, where the previous neighbour stops
  // being meaningful because the window changed size or jumped. Guessing here
  // would cost a wasted request on every operator who never steps.
  const [stepDirection, setStepDirection] = useState<StepDirection>(null);

  useEffect(() => {
    // Mount-time read of client-only values (localStorage) — the canonical
    // hydration-safe pattern, so the synchronous setState here is intentional.
    // SSR + the first client render both use the defaults (view + filters), then
    // we adopt the stored selections here once, after mount.
    /* eslint-disable react-hooks/set-state-in-effect */
    const stored = readStoredView();
    if (stored !== DEFAULT_VIEW) {
      setView(stored);
      setAnchor((cur) => anchorFor(stored, cur));
    }
    setFilters(readStoredFilters());
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    // Start the grid chunk here rather than on a hover affordance — there isn't
    // one, since the grid IS the default content. Kicking it off from the same
    // effect that enables the query makes the 98 KB download run PARALLEL to the
    // calendar request instead of serially before it.
    void import("./calendar-grid");
  }, []);

  // Persist the chosen view (after hydration) so a refresh restores it — a
  // logout doesn't clear it, so re-opening still shows the last view.
  useEffect(() => {
    if (hydrated) window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view, hydrated]);

  // Persist the status/scope filters (after hydration) so a refresh restores
  // them instead of snapping back to the Planned+In-progress default. Resource
  // selections are intentionally not persisted (see readStoredFilters).
  useEffect(() => {
    if (hydrated) {
      window.localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(serializeFilters(filters)));
    }
  }, [filters, hydrated]);
  // No live clock here on purpose. The sidebar owns it (`useNow`), because it is
  // the only consumer: held in page state, its once-a-minute tick re-rendered
  // this whole subtree — including `CalendarGrid`, which is not `memo`ised, so
  // its body ran end to end for a value it never reads (RUK-265).
  const range = useMemo(() => viewRange(view, anchor), [view, anchor]);

  // Zone the grid renders event times in (RUK-201). UTC during SSR/first render
  // (hydration-safe), then the resolved operator zone. The calendar's anchor,
  // `from`/`to` query window, and header title stay UTC-computed — those track
  // the calendar DATE, not a wall-clock instant — so only the grid's rendered
  // event times shift into `zone`.
  const { zone } = useTimezone();

  // Gate the "New maintenance" entry points on write-capable roles. Fail-closed:
  // while `/me` is pending or errored, `data` is undefined → `canWrite` false →
  // the links stay hidden, so no guest sees a create action they can't use.
  const me = useMeQuery().data;
  const canCreate = canWrite(me?.roles);

  // Status is filtered SERVER-SIDE: send the active status set as query params so
  // `items` already only holds the selected statuses (no client status filter).
  // Sorted + memoized so the query key is stable and toggling chips refetches
  // only when the set actually changes. Only `scope` stays client-side below.
  const statusParam = useMemo(() => Array.from(filters.statuses).sort(), [filters.statuses]);

  // Resource is filtered SERVER-SIDE too (RUK-256): the backend accepts repeated
  // `resource_ids` and applies its 1000-event cap AFTER filtering, so a client
  // predicate would narrow an already-truncated window and silently lose matches
  // past the cap.
  //
  // Sorted, and here is the subtle part: `calendarKey` sorts `statuses` itself
  // but passes `resourceIds` through as given. So THIS sort is the only thing
  // keeping "pick A then B" and "pick B then A" on one cache entry.
  const resourceParam = useMemo(() => Array.from(filters.resources.keys()).sort(), [filters.resources]);

  // The window the REQUEST uses, which lags the one the header renders. Every
  // chevron click is a brand-new cache key, so without this a burst costs one
  // round-trip and one full re-map per click — and stepping forward is always a
  // miss, since `staleTime` only ever spares a return to a window already seen.
  //
  // Only the request lags. `anchor`, `periodTitle` and the grid below still
  // update straight from the click: debouncing those would trade a request
  // problem for a visibly sluggish chevron, which is a worse deal than the one
  // we are fixing.
  const rawWindow = useMemo(() => ({ from: toDateParam(range.from), to: toDateParam(range.to) }), [range]);
  // `hydrated` marks the point where the window stops being provisional: before
  // it, the stored view has not been read yet and nothing is fetched, so those
  // windows must pass through without closing the leading-edge latch.
  const debouncedWindow = useCalendarWindow(rawWindow, hydrated);
  // Has the request caught up with the header yet? While it hasn't, the anchor
  // and the requested window describe different points in time, and anything
  // derived from the anchor (the prefetch's neighbour) would be off by a step.
  const windowSettled = sameWindow(debouncedWindow, rawWindow);

  const queryParams = useMemo(
    () => ({
      from: debouncedWindow.from,
      to: debouncedWindow.to,
      statuses: statusParam,
      resourceIds: resourceParam,
    }),
    [debouncedWindow, statusParam, resourceParam],
  );

  const query = useCalendarQuery(
    queryParams,
    // `hydrated` always flips in the mount effect above, so the query is
    // disabled for exactly one commit and `isPending` stays true across it —
    // the page shows CalendarLoading, which is what it would show anyway.
    { enabled: hydrated },
  );

  // Warm the window the operator is walking toward. Three conditions, and the
  // third is the subtle one: `windowSettled`. Without it the anchor has already
  // moved while the request has not, so the neighbour is stepped from the wrong
  // place — it warmed the window AFTER the one being stepped into, and did so
  // ahead of the real request, since nothing is in flight during the quiet
  // period. The direction gate keeps the cold load at a single request.
  useCalendarNeighbourPrefetch({
    params: queryParams,
    view,
    anchor,
    direction: stepDirection,
    enabled: hydrated && windowSettled && !query.isFetching,
  });

  const items = useMemo(() => query.data ?? [], [query.data]);

  // Which empty state is truthful? Before RUK-256 this was `items.length`: rows
  // present meant the client filters had hidden them, rows absent meant the
  // period really was empty. Server-side resource filtering breaks that test —
  // a resource filter matching nothing now returns NO rows, so the page would
  // claim "nothing is scheduled for this period" (false — work exists, it is
  // filtered out) and would hide "Reset filters", the only control that undoes
  // it, exactly when the operator needs it.
  //
  // So the question becomes "is a filter narrowing this view?" instead.
  //
  // `statuses` is deliberately NOT part of it: a non-default status selection
  // can also empty the grid and also lands on the period-empty card. That is
  // pre-existing behaviour on a different axis, and widening this predicate to
  // cover it is a change this ticket did not set out to make.
  const filtersNarrowing = filters.scope !== "all" || filters.resources.size > 0;
  // `items` is already status- AND resource-filtered by the server; the only
  // client dimension left is `scope`. The sidebar gets the same `items` for its
  // "Up next" panel (its resource picker reads the catalogue, not the window).
  const filteredItems = useMemo(() => applyCalendarFilters(items, filters), [items, filters]);
  const status: "loading" | "error" | "ready" = query.isPending
    ? "loading"
    : query.isError
      ? "error"
      : "ready";

  // Is the grid showing a window the header no longer names?
  //
  // `isPlaceholderData` is exactly that question: it is true when the data on
  // screen came from a DIFFERENT query key than the active one — another window,
  // or another status filter. Deliberately not `isError`: a settled error keeps
  // no data at all (TanStack applies `keepPreviousData` only while the query is
  // pending), so the error branch above already renders the right thing with
  // nothing to preserve. The lie the operator sees is the IN-FLIGHT state, not
  // the failed one (RUK-267).
  //
  // Gated on the condition lasting, because it is true on every ordinary step
  // for a few hundred ms. Normally transient; on a dead session it never ends,
  // since `bffFetch` answers a 401 with a promise that never settles so the UI
  // cannot flash an error during the redirect to /login.
  //
  // Known sequence on a SLOW 5xx, measured rather than assumed: banner, then the
  // full-screen error replaces the whole view. Timeline at 50 ms/char with the
  // hook's real retry policy: `-------BBBB…BBBB EEEE…`. That looks like the
  // banner failing at its job of preserving context, and it is worth being clear
  // that it is not. Once the query settles into error there IS no retained data
  // to preserve — that is the finding this whole ticket rests on — so
  // `CalendarError` is the only honest rendering left. The banner covers the
  // in-flight period truthfully; the error covers what comes after. A fast 5xx
  // never shows the banner at all, because it settles inside the threshold.
  const showStaleNotice = useDelayedFlag(query.isPlaceholderData, staleNoticeDelayMs);

  const client = useQueryClient();
  // Retry has to CANCEL before it refetches, or it does nothing at all.
  //
  // `Query.fetch` only restarts an in-flight request when the cache entry
  // already holds data (`query.js`: the `cancelRefetch` branch is gated on
  // `state.data !== undefined`). Here it never does — the events on screen came
  // from the placeholder, not from this key's entry — so a bare `refetch()`
  // falls through to `return this.#retryer.promise` and hands back the SAME
  // pending promise. Measured: three refetch() calls, zero requests issued.
  //
  // That matters most in the case this banner exists for: on a 401 the promise
  // never settles, the retryer never becomes rejected, and Retry would be a dead
  // button forever. Cancelling first drops the retryer, so the refetch below
  // starts a real request.
  //
  // `cancelQueries`, not `removeQueries`: cancelling leaves the placeholder on
  // screen, while removing the entry would blank the grid — throwing away the
  // context this whole banner exists to keep.
  //
  // The `.catch` is a guard on `cancelQueries` rejecting, NOT a swallowed query
  // error: `refetch()` resolves with the observer result rather than throwing, so
  // a failed retry still lands in `query.isError` and renders. Nothing is hidden
  // from the operator here.
  //
  // `rawWindow`, not `queryParams`: the latter is built from the DEBOUNCED
  // window, which lags the header by up to `MAX_WAIT_MS`. Retry sits under a
  // banner that says "this period", so during that quiet period it would cancel
  // and refetch the period the operator has already stepped away from. Measured:
  // header on Aug 15, request went out for Aug 14. It self-corrected once the
  // debounce published, so the cost was a wasted request and a button that
  // briefly did something other than what it says — which is still the wrong
  // thing for the one control this banner offers.
  const retryWindow = () => {
    void client
      .cancelQueries({ queryKey: calendarKey({ ...queryParams, ...rawWindow }) })
      .then(() => query.refetch())
      .catch(() => {});
  };

  // Stepping moves the anchor and records which way we went, always together:
  // the direction the operator stepped IS the direction worth warming, and the
  // prefetch reads it straight back. Keeping the pair in one place is what stops
  // the two halves drifting apart (a chevron that moves but warms the far side).
  const step = (delta: Exclude<StepDirection, null>) => {
    setAnchor((a) => stepAnchor(view, a, delta));
    setStepDirection(delta);
  };

  const changeView = (next: View) => {
    // Land on today when switching into Day from a period that contains it
    // (so Day opens on the current day + scrolls to "now"); otherwise keep the
    // user at the same point in time. See `anchorOnViewSwitch`.
    setAnchor((cur) => anchorOnViewSwitch(view, next, cur, new Date()));
    setView(next);
    // A Day neighbour is not a Month neighbour: the window changes size and
    // often position, so whichever way they were stepping no longer names a
    // window worth warming.
    setStepDirection(null);
  };

  return (
    <div className="mx-auto max-w-[1400px] p-6 space-y-4">
      <header className="flex items-center gap-3 flex-wrap">
        {/* Google-Calendar layout: navigation (prev/next + Today) leads on the
            left, then the date range, with the view tabs + primary action pushed
            to the right via `ml-auto` on the date. Putting the flexible gap AFTER
            the date means its variable width (Day "· HH:mm UTC" vs short Month
            title) is absorbed by the gap — so the nav stays put on the left and
            the tabs stay put on the right with no per-view shifting, without
            needing a magic min-width on the title. */}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Previous" onClick={() => step(-1)}>
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Next" onClick={() => step(1)}>
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setAnchor(anchorFor(view, new Date()));
              // A jump, not a step — there is no "next one along" to warm.
              setStepDirection(null);
            }}
          >
            Today
          </Button>
        </div>
        {/* Date range — the header focus, so the logo/nav already establish
            "Calendar" and there's no redundant h1 (per the built-HTML contract).
            Just the date: no live clock suffix (it read as fixed/odd and the
            live UTC time lives in the grid's now-indicator instead). */}
        <h1 className="h2 tabular-nums ml-2 mr-auto">{periodTitle(view, anchor)}</h1>
        <Tabs value={view} onValueChange={(v) => changeView(v as View)}>
          <TabsList>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
          </TabsList>
        </Tabs>
        {canCreate ? (
          <Button asChild size="sm">
            <Link href="/maintenance/new">
              <Plus className="size-3.5" aria-hidden="true" /> New maintenance
            </Link>
          </Button>
        ) : null}
      </header>

      {status === "loading" ? (
        <CalendarLoading />
      ) : status === "error" ? (
        <CalendarError onRetry={() => query.refetch()} />
      ) : (
        // ~76/24 main-to-sidebar split per the design contract. The sidebar
        // (filters + resource picker + Up next) renders in BOTH the empty and
        // populated states so the filter controls don't disappear when a view's
        // window happens to be empty — only the left column's content swaps.
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,76fr)_minmax(220px,24fr)]">
          <div className="min-w-0 space-y-2">
            {/* Truncation signal (RUK-252). It rides WITH the grid column rather
                than replacing the view, so no third visual state appears between
                CalendarLoading and the grid (see the note above on the
                deliberately matched heights). It renders only when the window is
                KNOWN to be truncated and returns null otherwise, so the
                not-truncated case adds no node and shifts no layout. */}
            {/* Suppressed while the window is stale. `meta` is already
                undefined under placeholder data (RUK-265), so today this changes
                nothing — but relying on another ticket's invariant to keep a
                count off screen is how that count comes back. The rule it
                protects is RUK-252's: a confidently wrong number is worse than
                silence, and the retained window's count describes a period the
                header is no longer showing. */}
            {showStaleNotice ? null : <CalendarTruncationNotice meta={query.meta} />}
            <div className="relative min-w-0">
              {/* Rides INSIDE this relative wrapper, over the grid's top edge,
                  so it occupies no space in the column. The grid below is a
                  fixed `calc(100vh-13rem)`; a banner in the flow would push it
                  down and give the page a scrollbar 1.5s after a click. */}
              {showStaleNotice ? <CalendarStaleWindowNotice onRetry={retryWindow} /> : null}
              {filteredItems.length === 0 ? (
                // The grid renders the scope-filtered set, so the empty overlay
                // keys off `filteredItems`. Which of the two empty states is
                // truthful is decided by `filtersNarrowing` above, not by
                // `items.length` — see the note there. A lightweight STATIC
                // backdrop stands in for the grid; we no longer mount a second
                // live FullCalendar just for decoration.
                <>
                  {/* Static backdrop standing in for the grid. Uses the SAME
                    viewport-bound height as the populated grid (see
                    calendar-grid.tsx) so the empty↔populated transition doesn't
                    change the page height or introduce a page scroll. */}
                  <div
                    aria-hidden="true"
                    className="h-[calc(100vh-13rem)] rounded-md border border-border-subtle bg-bg-elev-1 bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_47px,var(--border-subtle)_47px,var(--border-subtle)_48px)] opacity-40"
                  />
                  {/* While the window is stale, the backdrop stands alone: no
                      empty-state card.

                      `CalendarEmpty` says "No maintenance scheduled for this
                      period" — a claim about the period in the HEADER, which is
                      not the period these (absent) events came from. If the
                      retained window is empty, or the client-side scope filter
                      empties it, the page would assert that nothing is
                      scheduled in a period it has not loaded, directly beside a
                      banner saying it is still loading. That is the same lie to
                      the operator this ticket removes, in a new costume. The
                      banner is then the only statement on screen, and it is a
                      true one. */}
                  {showStaleNotice ? null : (
                    <div className="absolute inset-0 grid place-items-center">
                      <div className="bg-bg-elev-1 border border-border rounded-md shadow-md">
                        {filtersNarrowing ? (
                          <CalendarEmpty
                            title="No maintenance matches your filters"
                            // No count: resource is filtered server-side now, so
                            // `items` no longer holds the rows a resource filter
                            // hid — it holds none of them. Printing `items.length`
                            // here would confidently say "0 hidden", which is the
                            // kind of precise-and-wrong number RUK-252 exists to
                            // keep off the screen.
                            caption="Hidden by the current Scope or Resource filters."
                            cta={
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setFilters(defaultFilterState())}
                              >
                                Reset filters
                              </Button>
                            }
                          />
                        ) : (
                          <CalendarEmpty
                            // Guest: neutral empty state, no create link. `cta={false}`
                            // (not undefined) suppresses CalendarEmpty's default
                            // "New maintenance" button — `??` only falls back on nullish.
                            caption={canCreate ? undefined : "No maintenance is scheduled for this period."}
                            cta={
                              canCreate ? (
                                <Button asChild size="sm">
                                  <Link href="/maintenance/new">
                                    <Plus className="size-3" aria-hidden="true" /> New maintenance
                                  </Link>
                                </Button>
                              ) : (
                                false
                              )
                            }
                          />
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                // The grid renders the scope-filtered set; the sidebar reads the
                // same window for its "Up next" panel (its resource picker reads
                // the catalogue, not this).
                <CalendarGrid
                  view={view}
                  anchor={anchor}
                  items={filteredItems}
                  onSelect={setSelectedId}
                  timeZone={zone}
                />
              )}
            </div>
          </div>
          <CalendarSidebar
            items={items}
            filters={filters}
            onFiltersChange={setFilters}
            onSelect={setSelectedId}
          />
        </div>
      )}

      {selectedId !== null ? (
        <MaintenanceQuickSheet
          maintenanceId={selectedId}
          open
          onOpenChange={(o) => !o && setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}
