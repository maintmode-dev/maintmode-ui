"use client";

import { ChevronLeft, ChevronRight, Plus, SlidersHorizontal } from "lucide-react";

import { Button } from "@/shared/ui/primitives/button";
import {
  formatLocalDateParam,
  parseLocalDateParam,
  type CalendarViewMode,
} from "@/features/calendar/lib/calendar-navigation";

type CalendarTopPanelProps = {
  view: CalendarViewMode;
  date: string;
  onViewChange: (view: CalendarViewMode) => void;
  onDateChange: (date: string) => void;
  onCreate?: () => void;
  /** Open filters drawer (mobile/tablet only). When omitted, the Filters button is hidden. */
  onOpenFilters?: () => void;
  /** Number of active filters to surface on the mobile Filters button. */
  activeFilterCount?: number;
};

const VIEW_BUTTONS: ReadonlyArray<{ value: CalendarViewMode; label: string; short: string }> = [
  { value: "month", label: "Month", short: "M" },
  { value: "week", label: "Week", short: "W" },
  { value: "day", label: "Day", short: "D" },
];

export function CalendarTopPanel({
  view,
  date,
  onViewChange,
  onDateChange,
  onCreate,
  onOpenFilters,
  activeFilterCount = 0,
}: CalendarTopPanelProps) {
  const anchor = parseLocalDateParam(date) ?? new Date();

  const shift = (direction: -1 | 1) => {
    const next = new Date(anchor);
    if (view === "day") {
      next.setDate(next.getDate() + direction);
    } else if (view === "week") {
      next.setDate(next.getDate() + direction * 7);
    } else {
      next.setMonth(next.getMonth() + direction);
    }
    onDateChange(formatLocalDateParam(next));
  };

  const goToday = () => onDateChange(formatLocalDateParam(new Date()));

  const formattedAnchor = formatAnchorLabel(view, anchor);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2 sm:px-4 sm:py-3 md:flex-nowrap">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => shift(-1)} aria-label="Previous range">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="sm" onClick={() => shift(1)} aria-label="Next range">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="sm" onClick={goToday}>
          Today
        </Button>
        <span className="ml-1 max-w-[55vw] truncate text-sm font-semibold text-[var(--foreground)] sm:ml-3 sm:max-w-none">
          {formattedAnchor}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onOpenFilters ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={onOpenFilters}
            aria-label="Open filters"
            className="lg:hidden"
            data-testid="open-filters-button"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span className="hidden sm:inline">Filters</span>
            {activeFilterCount > 0 ? (
              <span
                aria-label={`${activeFilterCount} active filters`}
                className="ml-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold text-white"
              >
                {activeFilterCount}
              </span>
            ) : null}
          </Button>
        ) : null}
        {onCreate ? (
          <Button variant="primary" size="sm" onClick={onCreate} data-testid="create-maintenance-button" aria-label="New maintenance">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New maintenance</span>
          </Button>
        ) : null}
        <div
          role="group"
          aria-label="Calendar view"
          className="inline-flex overflow-hidden rounded-md border border-[var(--border)]"
        >
          {VIEW_BUTTONS.map((option) => {
            const active = option.value === view;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                aria-label={option.label}
                onClick={() => onViewChange(option.value)}
                className={
                  "px-2 py-1.5 text-xs font-semibold transition sm:px-3 " +
                  (active
                    ? "bg-[var(--surface-subtle)] text-[var(--foreground)]"
                    : "bg-[var(--surface)] text-[var(--muted-strong)] hover:bg-[var(--surface-subtle)]")
                }
              >
                <span className="hidden sm:inline">{option.label}</span>
                <span className="sm:hidden">{option.short}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatAnchorLabel(view: CalendarViewMode, anchor: Date) {
  if (view === "day") {
    return anchor.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }
  if (view === "week") {
    return `Week of ${anchor.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  }
  return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
