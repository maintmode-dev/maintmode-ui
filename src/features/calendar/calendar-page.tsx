"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { canWrite } from "@/domain/auth/permissions";
import { CalendarEmpty, CalendarError, CalendarLoading } from "@/shared/ui/states";
import { Button } from "@/shared/ui/shadcn/button";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/shadcn/tabs";

import { CalendarSidebar } from "./calendar-sidebar";
import { CalendarTruncationNotice } from "./calendar-truncation-notice";
import {
  applyCalendarFilters,
  defaultFilterState,
  readStoredFilters,
  serializeFilters,
  FILTERS_STORAGE_KEY,
} from "./calendar-filters";
import { useCalendarQuery } from "./queries/use-calendar-query";
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

export function CalendarPage() {
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
  // Live clock consumed by the sidebar's "Up next" panel (it scopes to
  // running-now + today/tomorrow). Tick once a minute so the list stays current.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

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
  // only when the set actually changes. Scope/resource stay client-side below.
  const statusParam = useMemo(() => Array.from(filters.statuses).sort(), [filters.statuses]);

  const query = useCalendarQuery(
    {
      from: toDateParam(range.from),
      to: toDateParam(range.to),
      statuses: statusParam,
    },
    // `hydrated` always flips in the mount effect above, so the query is
    // disabled for exactly one commit and `isPending` stays true across it —
    // the page shows CalendarLoading, which is what it would show anyway.
    { enabled: hydrated },
  );

  const items = useMemo(() => query.data ?? [], [query.data]);
  // `items` is already status-filtered by the server; here we apply only the
  // CLIENT dimensions (scope + resource). The sidebar still sees the full status-
  // filtered `items` so its resource picker + Up next reflect the window.
  const filteredItems = useMemo(() => applyCalendarFilters(items, filters), [items, filters]);
  const status: "loading" | "error" | "ready" = query.isPending
    ? "loading"
    : query.isError
      ? "error"
      : "ready";

  const changeView = (next: View) => {
    // Land on today when switching into Day from a period that contains it
    // (so Day opens on the current day + scrolls to "now"); otherwise keep the
    // user at the same point in time. See `anchorOnViewSwitch`.
    setAnchor((cur) => anchorOnViewSwitch(view, next, cur, new Date()));
    setView(next);
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
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous"
            onClick={() => setAnchor((a) => stepAnchor(view, a, -1))}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next"
            onClick={() => setAnchor((a) => stepAnchor(view, a, 1))}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAnchor(anchorFor(view, new Date()))}>
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
            <CalendarTruncationNotice meta={query.meta} />
            <div className="relative min-w-0">
              {filteredItems.length === 0 ? (
                // The grid renders the client-filtered set, so the empty overlay
                // keys off `filteredItems`. We distinguish the two reasons it's
                // empty: the server returned nothing for the active statuses
                // (`items` empty) vs. scope/resource hid everything (`items` has
                // rows). A lightweight STATIC backdrop stands in for the grid — we
                // no longer mount a second live FullCalendar just for decoration.
                <>
                  {/* Static backdrop standing in for the grid. Uses the SAME
                    viewport-bound height as the populated grid (see
                    calendar-grid.tsx) so the empty↔populated transition doesn't
                    change the page height or introduce a page scroll. */}
                  <div
                    aria-hidden="true"
                    className="h-[calc(100vh-13rem)] rounded-md border border-border-subtle bg-bg-elev-1 bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_47px,var(--border-subtle)_47px,var(--border-subtle)_48px)] opacity-40"
                  />
                  <div className="absolute inset-0 grid place-items-center">
                    <div className="bg-bg-elev-1 border border-border rounded-md shadow-md">
                      {items.length === 0 ? (
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
                      ) : (
                        <CalendarEmpty
                          title="No maintenance matches your filters"
                          caption={`${items.length} hidden by the current Scope or Resource filters.`}
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
                      )}
                    </div>
                  </div>
                </>
              ) : (
                // The grid renders the client-filtered set; the sidebar reads the
                // full status-filtered window for its options.
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
            now={now}
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
