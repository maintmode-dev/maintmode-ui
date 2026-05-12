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
import { CalendarFilterPanel } from "@/features/calendar/components/calendar-filter-panel";
import { CalendarTopPanel } from "@/features/calendar/components/calendar-top-panel";
import { MaintenanceCalendar } from "@/features/calendar/components/maintenance-calendar";
import { MaintenanceDetailsSheet } from "@/features/maintenance-details/components/maintenance-details-sheet";
import { Skeleton } from "@/shared/ui/primitives/skeleton";

export function CalendarPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialState = useMemo(
    () => parseCalendarSearchParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const [state, setState] = useState<CalendarFilterState>(initialState);
  const initialMaintenanceId = searchParams.get("maintenance");
  const [selectedMaintenanceId, setSelectedMaintenanceId] = useState<string | null>(
    () => initialMaintenanceId,
  );
  const lastSyncedHref = useRef<string | null>(null);

  // Mirror state into the URL so deep-links + reload keep filters. Skip the
  // initial render when state still matches the URL we were mounted from —
  // otherwise a `router.replace` happens on every page load with no change.
  useEffect(() => {
    const params = buildCalendarSearchParams(state);
    if (selectedMaintenanceId) {
      params.set("maintenance", selectedMaintenanceId);
    }
    const nextHref = `/?${params.toString()}`;
    if (lastSyncedHref.current === null) {
      const initialHref = `/?${(() => {
        const initialParams = buildCalendarSearchParams(initialState);
        if (initialMaintenanceId) {
          initialParams.set("maintenance", initialMaintenanceId);
        }
        return initialParams.toString();
      })()}`;
      lastSyncedHref.current = initialHref;
      if (initialHref === nextHref) {
        return;
      }
    }
    if (lastSyncedHref.current === nextHref) {
      return;
    }
    lastSyncedHref.current = nextHref;
    router.replace(nextHref, { scroll: false });
  }, [state, selectedMaintenanceId, router, initialState, initialMaintenanceId]);

  const query = useCalendarQuery(state);
  const maintenances = query.data?.maintenances ?? [];

  const update = useCallback(
    <K extends keyof CalendarFilterState>(key: K, value: CalendarFilterState[K]) => {
      setState((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  return (
    <div className="flex h-full min-h-[calc(100vh-64px)] flex-col">
      <CalendarTopPanel
        view={state.view}
        date={state.date}
        onViewChange={(view: CalendarViewMode) => update("view", view)}
        onDateChange={(date) => update("date", date)}
      />
      <div className="flex flex-1 flex-col lg:flex-row">
        <div className="flex-1 min-h-[480px]">
          {query.isLoading ? (
            <CalendarSkeleton />
          ) : query.isError ? (
            <CalendarErrorState onRetry={() => query.refetch()} />
          ) : maintenances.length === 0 ? (
            <CalendarEmptyState />
          ) : (
            <MaintenanceCalendar
              view={state.view}
              date={state.date}
              maintenances={maintenances}
              onSelectMaintenance={(id) => setSelectedMaintenanceId(id)}
            />
          )}
        </div>
        <CalendarFilterPanel
          scope={state.scope}
          statuses={state.statuses}
          resourceIds={state.resourceIds}
          onScopeChange={(scope: CalendarScopeFilter) => update("scope", scope)}
          onStatusesChange={(statuses: MaintenanceStatus[]) => update("statuses", statuses)}
          onResourceIdsChange={(resourceIds) => update("resourceIds", resourceIds)}
        />
      </div>
      <MaintenanceDetailsSheet
        maintenanceId={selectedMaintenanceId}
        onClose={() => setSelectedMaintenanceId(null)}
      />
    </div>
  );
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

function CalendarEmptyState() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
        <h2 className="text-base font-semibold">No maintenances in this range</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Adjust filters or navigate to another date to see scheduled work.
        </p>
      </div>
    </div>
  );
}
