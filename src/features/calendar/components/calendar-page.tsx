"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { MaintenanceStatus } from "@/domain/maintenance/models/maintenance";
import { useCalendarQuery } from "@/features/calendar/queries/use-calendar-query";
import {
  buildCalendarSearchParams,
  parseCalendarSearchParams,
  type CalendarFilterState,
  type CalendarScopeFilter,
  type CalendarViewMode,
} from "@/features/calendar/lib/calendar-navigation";
import { CalendarFilterDrawer } from "@/features/calendar/components/calendar-filter-drawer";
import { CalendarFilterPanel } from "@/features/calendar/components/calendar-filter-panel";
import { CalendarTopPanel } from "@/features/calendar/components/calendar-top-panel";
import { MaintenanceCalendar } from "@/features/calendar/components/maintenance-calendar";
import {
  MaintenanceDetailsSheet,
  type MaintenanceSheetMode,
} from "@/features/maintenance-details/components/maintenance-details-sheet";
import { Skeleton } from "@/shared/ui/primitives/skeleton";

type SheetState =
  | { mode: "closed" }
  | { mode: "view"; id: string }
  | { mode: "edit"; id: string }
  | { mode: "create"; defaultStart?: string };

export function CalendarPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialState = useMemo(
    () => parseCalendarSearchParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const [state, setState] = useState<CalendarFilterState>(initialState);
  const [sheetState, setSheetState] = useState<SheetState>(() => parseInitialSheetState(searchParams));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const lastSyncedHref = useRef<string | null>(null);

  // Mirror state into the URL so deep-links + reload keep filters and sheet
  // mode. Skip the initial render when state still matches the URL we were
  // mounted from.
  useEffect(() => {
    const params = buildCalendarSearchParams(state);
    if (sheetState.mode === "view" || sheetState.mode === "edit") {
      params.set("maintenance", sheetState.id);
      if (sheetState.mode === "edit") {
        params.set("edit", "1");
      }
    } else if (sheetState.mode === "create") {
      params.set("create", "1");
      if (sheetState.defaultStart) {
        params.set("start", sheetState.defaultStart);
      }
    }
    const nextHref = `/?${params.toString()}`;
    if (lastSyncedHref.current === null) {
      lastSyncedHref.current = nextHref;
      // Skip the very first effect when URL already matches.
      const currentHref = `/?${searchParams.toString()}`;
      if (currentHref === nextHref) {
        return;
      }
    }
    if (lastSyncedHref.current === nextHref) {
      return;
    }
    lastSyncedHref.current = nextHref;
    router.replace(nextHref, { scroll: false });
  }, [state, sheetState, router, searchParams]);

  const query = useCalendarQuery(state);
  const maintenances = query.data?.maintenances ?? [];

  const update = useCallback(
    <K extends keyof CalendarFilterState>(key: K, value: CalendarFilterState[K]) => {
      setState((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const sheetMode: MaintenanceSheetMode =
    sheetState.mode === "closed" ? "view" : sheetState.mode;
  const sheetId =
    sheetState.mode === "view" || sheetState.mode === "edit" ? sheetState.id : null;
  const sheetCreateStart = sheetState.mode === "create" ? sheetState.defaultStart : undefined;

  const handleSheetClose = useCallback(() => setSheetState({ mode: "closed" }), []);
  const handleSheetModeChange = useCallback(
    (nextMode: MaintenanceSheetMode) => {
      setSheetState((current) => {
        if (current.mode === "view" || current.mode === "edit") {
          if (nextMode === "view" || nextMode === "edit") {
            return { mode: nextMode, id: current.id };
          }
        }
        return current;
      });
    },
    [],
  );

  const activeFilterCount =
    (state.scope !== "all" ? 1 : 0) + state.statuses.length + state.resourceIds.length;

  return (
    <div className="flex h-full min-h-[calc(100vh-64px)] flex-col">
      <CalendarTopPanel
        view={state.view}
        date={state.date}
        onViewChange={(view: CalendarViewMode) => update("view", view)}
        onDateChange={(date) => update("date", date)}
        onCreate={() => setSheetState({ mode: "create" })}
        onOpenFilters={() => setFiltersOpen(true)}
        activeFilterCount={activeFilterCount}
      />
      <div className="flex flex-1 flex-col lg:flex-row">
        <div className="flex flex-1 min-h-[480px] flex-col">
          {query.isLoading ? (
            <CalendarSkeleton />
          ) : query.isError ? (
            <CalendarErrorState onRetry={() => query.refetch()} />
          ) : (
            <>
              <MaintenanceCalendar
                view={state.view}
                date={state.date}
                maintenances={maintenances}
                onSelectMaintenance={(id) => setSheetState({ mode: "view", id })}
                onSelectSlot={(startIso) =>
                  setSheetState({ mode: "create", defaultStart: toDatetimeLocal(startIso) })
                }
              />
              {maintenances.length === 0 ? <CalendarEmptyHint /> : null}
            </>
          )}
        </div>
        <aside
          className="hidden w-[280px] shrink-0 border-l border-[var(--border)] bg-[var(--surface)] lg:flex"
          data-testid="calendar-filter-aside"
        >
          <CalendarFilterPanel
            scope={state.scope}
            statuses={state.statuses}
            resourceIds={state.resourceIds}
            onScopeChange={(scope: CalendarScopeFilter) => update("scope", scope)}
            onStatusesChange={(statuses: MaintenanceStatus[]) => update("statuses", statuses)}
            onResourceIdsChange={(resourceIds) => update("resourceIds", resourceIds)}
          />
        </aside>
      </div>
      <CalendarFilterDrawer
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        scope={state.scope}
        statuses={state.statuses}
        resourceIds={state.resourceIds}
        onScopeChange={(scope: CalendarScopeFilter) => update("scope", scope)}
        onStatusesChange={(statuses: MaintenanceStatus[]) => update("statuses", statuses)}
        onResourceIdsChange={(resourceIds) => update("resourceIds", resourceIds)}
      />
      <MaintenanceDetailsSheet
        maintenanceId={sheetId}
        mode={sheetMode}
        createDefaultStart={sheetCreateStart}
        onClose={handleSheetClose}
        onModeChange={handleSheetModeChange}
      />
    </div>
  );
}

function parseInitialSheetState(searchParams: URLSearchParams | ReturnType<typeof useSearchParams>): SheetState {
  const get = (key: string): string | null =>
    typeof (searchParams as URLSearchParams).get === "function"
      ? (searchParams as URLSearchParams).get(key)
      : (searchParams as ReturnType<typeof useSearchParams>).get(key);
  if (get("create") === "1") {
    const start = get("start") ?? undefined;
    return { mode: "create", defaultStart: start };
  }
  const id = get("maintenance");
  if (id) {
    return get("edit") === "1" ? { mode: "edit", id } : { mode: "view", id };
  }
  return { mode: "closed" };
}

function toDatetimeLocal(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function CalendarSkeleton() {
  return (
    <div className="flex h-full flex-col gap-2 p-4" aria-busy="true">
      <Skeleton className="h-10 w-full" />
      <div className="grid flex-1 grid-cols-7 gap-2">
        {Array.from({ length: 7 * 5 }).map((_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
    </div>
  );
}

function CalendarErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-full items-center justify-center p-6" role="alert">
      <div className="max-w-md rounded-lg border border-[var(--danger-border)] bg-[var(--danger-soft)] p-6 text-center">
        <h2 className="text-base font-semibold text-[var(--danger-fg)]">Calendar failed to load</h2>
        <p className="mt-1 text-sm text-[var(--danger-fg)]">The maintmode backend rejected the request.</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border border-[var(--danger-fg)] bg-white px-3 py-1 text-xs font-semibold text-[var(--danger-fg)]"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

function CalendarEmptyHint() {
  return (
    <p className="px-4 py-2 text-xs text-[var(--muted)]">
      No maintenances in this range. Click a day or use “New maintenance” to schedule one.
    </p>
  );
}
