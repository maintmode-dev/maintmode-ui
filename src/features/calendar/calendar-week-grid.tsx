"use client";

import { useMemo } from "react";

import { cn } from "@/shared/ui/lib/cn";
import { CalendarEventBar } from "@/shared/ui/domain/calendar-event-bar";
import { formatRange } from "@/shared/ui/lib/format";
import type { Maintenance } from "@/domain/maintenance/maintenance";

import { MAX_LANES, placeWeek } from "./place-items";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR_PX = 36; // total grid height = 864px

export interface CalendarWeekGridProps {
  anchor: Date;
  items: Maintenance[];
  onSelect: (id: string) => void;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function CalendarWeekGrid({ anchor, items, onSelect }: CalendarWeekGridProps) {
  const { placed, overflow } = useMemo(() => placeWeek(items, anchor), [items, anchor]);
  // Memoize "today" so it stays stable across renders within the same minute;
  // updates when the component re-mounts.
  const today = useMemo(() => new Date(), []);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(anchor);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [anchor]);

  return (
    <div className="bg-bg-elev-1 border border-border-subtle rounded-md overflow-hidden">
      {/* day-name header */}
      <div className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))] border-b border-border-subtle bg-bg-elev-2">
        <div />
        {days.map((d, i) => {
          const isToday = isSameDay(d, today);
          const isWeekend = i >= 5;
          return (
            <div
              key={i}
              className={cn("px-3 py-2 border-l border-border-subtle", isWeekend && "bg-bg-elev-3/40")}
            >
              <div className="text-[10px] uppercase tracking-[0.08em] text-fg-dim">{DAY_LABELS[i]}</div>
              <div
                className={cn(
                  "text-sm tabular-nums mt-0.5",
                  isToday ? "text-[var(--today-line)] font-semibold" : "text-fg",
                )}
              >
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* body grid */}
      <div className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))] relative">
        {/* hour gutter */}
        <div className="border-r border-border-subtle bg-bg-elev-2">
          {HOURS.map((h) => (
            <div
              key={h}
              style={{ height: HOUR_PX }}
              className="px-2 text-[10px] text-fg-dim font-mono tabular-nums border-b border-border-subtle pt-0.5"
            >
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        {/* day columns */}
        {days.map((d, i) => {
          const isWeekend = i >= 5;
          const dayPlaced = placed.filter((p) => p.dayIdx === i);
          const dayOverflow = overflow.filter((o) => o.dayIdx === i);
          return (
            <div
              key={i}
              className={cn("relative border-l border-border-subtle", isWeekend && "bg-bg-elev-3/20")}
              style={{ height: HOUR_PX * 24 }}
            >
              {HOURS.map((h) => (
                <div key={h} style={{ height: HOUR_PX }} className="border-b border-grid-line" />
              ))}
              {/* "+N more" overflow chip — collapses events past MAX_LANES so
                  the column stays readable instead of stacking slivers. Pinned
                  to the last visible lane at the cluster's top. */}
              {dayOverflow.map((o, oi) => {
                const widthPct = 100 / MAX_LANES;
                const leftPct = (MAX_LANES - 1) * widthPct;
                return (
                  <div
                    key={`overflow-${i}-${oi}`}
                    className="absolute z-10 flex items-start justify-center"
                    style={{
                      top: `calc(${o.topPct}% + 2px)`,
                      left: `calc(${leftPct}% + 4px)`,
                      width: `calc(${widthPct}% - 8px)`,
                    }}
                  >
                    <span className="rounded-sm bg-bg-elev-4 px-1.5 py-px text-[10px] font-medium tabular-nums text-fg-muted shadow-[var(--shadow-sm)]">
                      +{o.count} more
                    </span>
                  </div>
                );
              })}
              {dayPlaced.map(({ m, topPct, heightPct, continuation, lane, lanes }, idx) => {
                // Lane width: divide column into N equal columns with a 2px
                // gutter between bars. A bar that doesn't overlap takes the
                // full width (lanes === 1).
                const widthPct = 100 / lanes;
                const leftPct = lane * widthPct;
                return (
                  <div
                    key={`${m.id}-${i}-${idx}`}
                    className="absolute"
                    style={{
                      top: `${topPct}%`,
                      height: `${heightPct}%`,
                      left: `calc(${leftPct}% + 4px)`,
                      width: `calc(${widthPct}% - 8px)`,
                    }}
                  >
                    <CalendarEventBar
                      status={m.status}
                      title={m.title}
                      time={formatRange(m.planned_period.start, m.planned_period.end)}
                      continuation={continuation}
                      onClick={() => onSelect(m.id)}
                      className="h-full"
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
