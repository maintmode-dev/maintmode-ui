"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

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
};

const VIEW_BUTTONS: ReadonlyArray<{ value: CalendarViewMode; label: string }> = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
];

export function CalendarTopPanel({ view, date, onViewChange, onDateChange, onCreate }: CalendarTopPanelProps) {
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
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => shift(-1)} aria-label="Previous range">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="sm" onClick={() => shift(1)} aria-label="Next range">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="sm" onClick={goToday}>
          Today
        </Button>
        <span className="ml-3 text-sm font-semibold text-[var(--foreground)]">{formattedAnchor}</span>
      </div>
      <div className="flex items-center gap-2">
        {onCreate ? (
          <Button variant="primary" size="sm" onClick={onCreate} data-testid="create-maintenance-button">
            <Plus className="h-4 w-4" />
            New maintenance
          </Button>
        ) : null}
        <div role="group" aria-label="Calendar view" className="inline-flex overflow-hidden rounded-md border border-[var(--border)]">
          {VIEW_BUTTONS.map((option) => {
          const active = option.value === view;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onViewChange(option.value)}
              className={
                "px-3 py-1.5 text-xs font-semibold transition " +
                (active
                  ? "bg-[var(--surface-subtle)] text-[var(--foreground)]"
                  : "bg-[var(--surface)] text-[var(--muted-strong)] hover:bg-[var(--surface-subtle)]")
              }
            >
              {option.label}
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
