"use client";

import { useMemo } from "react";

import { cn } from "@/shared/ui/lib/cn";
import type { Maintenance, MaintenanceStatus } from "@/domain/maintenance/maintenance";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_ROWS = 3;

export interface CalendarMonthGridProps {
  /** Any date within the month to render. */
  month: Date;
  items: Maintenance[];
  onSelect: (id: string) => void;
}

const DOT_CLASS: Record<MaintenanceStatus, string> = {
  draft: "bg-[var(--status-draft-fg)]",
  planned: "bg-[var(--status-planned-fg)]",
  in_progress: "bg-[var(--status-in_progress-fg)]",
  completed: "bg-[var(--status-completed-fg)]",
  canceled: "bg-[var(--status-canceled-fg)]",
};

function startOfMonthGrid(month: Date): Date {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  // Back up to Monday of the week containing the 1st.
  const dow = (first.getDay() + 6) % 7;
  first.setDate(first.getDate() - dow);
  first.setHours(0, 0, 0, 0);
  return first;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function CalendarMonthGrid({ month, items, onSelect }: CalendarMonthGridProps) {
  const gridStart = useMemo(() => startOfMonthGrid(month), [month]);
  const today = useMemo(() => new Date(), []);

  // 6 rows × 7 days covers every month layout; trim the trailing all-other-month
  // row when the month fits in 5.
  const cells = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < 42; i += 1) {
      const d = new Date(gridStart);
      d.setDate(d.getDate() + i);
      out.push(d);
    }
    // Drop the final week if it's entirely outside the active month.
    if (out.slice(35).every((d) => d.getMonth() !== month.getMonth())) out.length = 35;
    return out;
  }, [gridStart, month]);

  // Bucket events by local day key (events that span days appear on each day
  // they touch within the grid).
  const byDay = useMemo(() => {
    const map = new Map<string, Maintenance[]>();
    const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    for (const m of items) {
      const start = new Date(m.planned_period.start);
      const end = new Date(m.planned_period.end);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) continue;
      const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      while (cur.getTime() <= last.getTime()) {
        const k = key(cur);
        (map.get(k) ?? map.set(k, []).get(k)!).push(m);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return map;
  }, [items]);

  return (
    <div className="bg-bg-elev-1 border border-border-subtle rounded-md overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border-subtle bg-bg-elev-2">
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === month.getMonth();
          const isToday = isSameDay(d, today);
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          const dayEvents = byDay.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`) ?? [];
          const shown = dayEvents.slice(0, MAX_ROWS);
          const overflow = dayEvents.length - shown.length;
          return (
            <div
              key={i}
              className={cn(
                "min-h-[96px] border-b border-l border-border-subtle p-1.5 space-y-1",
                i % 7 === 0 && "border-l-0",
                isWeekend && "bg-bg-elev-3/20",
                !inMonth && "opacity-40",
              )}
            >
              <div
                className={cn(
                  "text-xs tabular-nums",
                  isToday
                    ? "inline-flex size-5 items-center justify-center rounded-full bg-[var(--today-line)] font-semibold text-white"
                    : "text-fg-muted",
                )}
              >
                {d.getDate()}
              </div>
              {shown.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelect(m.id)}
                  className="flex w-full items-center gap-1 rounded-sm px-1 py-0.5 text-left text-[11px] hover:bg-bg-row-hover"
                >
                  <span className={cn("size-1.5 shrink-0 rounded-full", DOT_CLASS[m.status])} aria-hidden="true" />
                  <span className="truncate text-fg">{m.title}</span>
                </button>
              ))}
              {overflow > 0 ? <div className="px-1 text-[10px] text-fg-dim">+{overflow} more</div> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
