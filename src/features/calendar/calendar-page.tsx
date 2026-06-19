"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CalendarEmpty, CalendarError, CalendarLoading } from "@/shared/ui/states";
import { Button } from "@/shared/ui/shadcn/button";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/shadcn/tabs";
import { cn } from "@/shared/ui/lib/cn";

import { CalendarGrid } from "./calendar-grid";
import { CalendarSidebar } from "./calendar-sidebar";
import {
  applyCalendarFilters,
  defaultFilterState,
  readStoredFilters,
  serializeFilters,
  FILTERS_STORAGE_KEY,
} from "./calendar-filters";
import { useCalendarQuery } from "./queries/use-calendar-query";
import { MaintenanceQuickSheet } from "@/features/maintenance/maintenance-quick-sheet";
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
  // overwritten by the default before it's read back.
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
  // Live UTC clock for the Day-view title suffix (` · HH:mm UTC`). Only the Day
  // title consumes it; tick once a minute so the suffix stays current.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const range = useMemo(() => viewRange(view, anchor), [view, anchor]);

  const query = useCalendarQuery({
    from: toDateParam(range.from),
    to: toDateParam(range.to),
  });

  const items = useMemo(() => query.data ?? [], [query.data]);
  // Sidebar status/scope/resource selections narrow the loaded window before
  // the grids render it. The sidebar itself still sees the full `items` so its
  // resource picker + Up next reflect everything in view, not the filtered set.
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

  const renderGrid = (gridItems: typeof items) => (
    <CalendarGrid view={view} anchor={anchor} items={gridItems} onSelect={setSelectedId} />
  );

  return (
    <div className="mx-auto max-w-[1400px] p-6 space-y-4">
      <header className="flex items-center gap-3 flex-wrap">
        {/* Date range is the header focus — the logo/nav already establish
            "Calendar", so no redundant h1 (per the built-HTML contract). */}
        {/* The `· HH:mm UTC` suffix is client-only (gated on `hydrated`): the
            live clock would otherwise differ between SSR and the first client
            render and trip a hydration mismatch. */}
        <h1 className="h2 tabular-nums">
          {periodTitle(view, anchor, view === "day" && hydrated ? now : undefined)}
        </h1>
        <div className="flex items-center gap-1 ml-2">
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
        <Tabs value={view} onValueChange={(v) => changeView(v as View)} className="ml-2">
          <TabsList>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="ml-auto">
          <Button asChild size="sm">
            <Link href="/maintenance/new">
              <Plus className="size-3.5" aria-hidden="true" /> New maintenance
            </Link>
          </Button>
        </div>
      </header>

      {status === "loading" ? (
        <CalendarLoading />
      ) : status === "error" ? (
        <CalendarError onRetry={() => query.refetch()} />
      ) : items.length === 0 ? (
        <div className={cn("relative", "opacity-40 pointer-events-none")}>
          {renderGrid([])}
          <div className="absolute inset-0 grid place-items-center pointer-events-auto">
            <div className="bg-bg-elev-1 border border-border rounded-md shadow-md">
              <CalendarEmpty
                cta={
                  <Button asChild size="sm">
                    <Link href="/maintenance/new">
                      <Plus className="size-3" aria-hidden="true" /> New maintenance
                    </Link>
                  </Button>
                }
              />
            </div>
          </div>
        </div>
      ) : (
        // ~76/24 main-to-sidebar split per the design contract. The grid renders
        // the filtered set; the sidebar reads the full window for its options.
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,76fr)_minmax(220px,24fr)]">
          <div className="relative min-w-0">{renderGrid(filteredItems)}</div>
          <CalendarSidebar
            items={items}
            filters={filters}
            onFiltersChange={setFilters}
            now={now}
            onSelect={setSelectedId}
          />
        </div>
      )}

      <MaintenanceQuickSheet
        maintenanceId={selectedId}
        open={selectedId !== null}
        onOpenChange={(o) => !o && setSelectedId(null)}
      />
    </div>
  );
}
