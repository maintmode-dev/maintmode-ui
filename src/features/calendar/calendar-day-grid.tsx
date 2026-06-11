"use client";

import { useEffect, useMemo, useRef } from "react";

import { cn } from "@/shared/ui/lib/cn";
import { CalendarEventBar } from "@/shared/ui/domain/calendar-event-bar";
import { STATUS_LABEL } from "@/shared/ui/domain/status-badge";
import { formatRange } from "@/shared/ui/lib/format";
import type { Maintenance, MaintenanceStatus } from "@/domain/maintenance/maintenance";

import { MAX_LANES, placeDay } from "./place-items";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
// Day bars carry more content than the Week grid, so the row is taller
// (44px/hour per the design's Day default density).
const HOUR_PX = 44;

export interface CalendarDayGridProps {
  day: Date;
  items: Maintenance[];
  onSelect: (id: string) => void;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Order the day-summary segments by lifecycle, skipping statuses with no events.
const CAPTION_ORDER: MaintenanceStatus[] = ["in_progress", "planned", "draft", "completed", "canceled"];

const DOT_CLASS: Record<MaintenanceStatus, string> = {
  draft: "bg-[var(--status-draft-fg)]",
  planned: "bg-[var(--status-planned-fg)]",
  in_progress: "bg-[var(--status-in_progress-fg)]",
  completed: "bg-[var(--status-completed-fg)]",
  canceled: "bg-[var(--status-canceled-fg)]",
};

export function CalendarDayGrid({ day, items, onSelect }: CalendarDayGridProps) {
  const { placed, overflow } = useMemo(() => placeDay(items, day), [items, day]);
  const now = useMemo(() => new Date(), []);
  const showNowLine = isSameDay(day, now);
  // Current-time line position as a percentage of the 24h column.
  const nowPct = ((now.getHours() * 60 + now.getMinutes()) / 1440) * 100;

  // Scroll the now-line into the middle of the viewport on mount, so a fresh
  // load of "today" lands at the current time rather than 00:00.
  const nowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (showNowLine) nowRef.current?.scrollIntoView({ block: "center" });
  }, [showNowLine]);

  // Status-dot day caption ("N in progress · N planned · …"). Counts the
  // distinct maintenances on this day (a midnight-crossing event still counts
  // once). Conflict count is omitted: the calendar list payload carries no
  // conflict flag (that lives on MaintenanceDetail), so it isn't inferable here.
  const counts = useMemo(() => {
    const seen = new Set<string>();
    const map = new Map<MaintenanceStatus, number>();
    for (const p of placed) {
      if (seen.has(p.m.id)) continue;
      seen.add(p.m.id);
      map.set(p.m.status, (map.get(p.m.status) ?? 0) + 1);
    }
    return CAPTION_ORDER.filter((s) => map.has(s)).map((s) => ({ status: s, n: map.get(s)! }));
  }, [placed]);

  return (
    <div className="bg-bg-elev-1 border border-border-subtle rounded-md overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border-subtle bg-bg-elev-2 px-3 py-2 text-xs text-fg-muted">
        {counts.length === 0 ? (
          <span className="text-fg-dim">No maintenance scheduled</span>
        ) : (
          counts.map(({ status, n }, i) => (
            <span key={status} className="inline-flex items-center gap-1.5">
              {i > 0 ? (
                <span aria-hidden="true" className="text-fg-dim">
                  ·
                </span>
              ) : null}
              <span className={cn("size-1.5 rounded-full", DOT_CLASS[status])} aria-hidden="true" />
              <span className="tabular-nums">
                {n} {STATUS_LABEL[status].toLowerCase()}
              </span>
            </span>
          ))
        )}
      </div>
      <div className="grid grid-cols-[60px_minmax(0,1fr)] relative">
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

        {/* single day column */}
        <div className="relative" style={{ height: HOUR_PX * 24 }}>
          {HOURS.map((h) => (
            <div key={h} style={{ height: HOUR_PX }} className="border-b border-grid-line" />
          ))}

          {showNowLine ? (
            <div
              ref={nowRef}
              className="absolute left-0 right-0 z-10 pointer-events-none"
              style={{ top: `${nowPct}%` }}
              aria-hidden="true"
            >
              <div className="h-px bg-[var(--today-line)]" />
              <div className="absolute -left-1 -top-1 size-2 rounded-full bg-[var(--today-line)]" />
            </div>
          ) : null}

          {/* "+N more" overflow chip (lanes past MAX_LANES collapse here). */}
          {overflow.map((o, oi) => {
            const widthPct = 100 / MAX_LANES;
            const leftPct = (MAX_LANES - 1) * widthPct;
            return (
              <div
                key={`overflow-${oi}`}
                className="absolute z-10 flex items-start justify-center"
                style={{
                  top: `calc(${o.topPct}% + 2px)`,
                  left: `calc(${leftPct}% + 8px)`,
                  width: `calc(${widthPct}% - 16px)`,
                }}
              >
                <span className="rounded-sm bg-bg-elev-4 px-1.5 py-px text-[10px] font-medium tabular-nums text-fg-muted shadow-[var(--shadow-sm)]">
                  +{o.count} more
                </span>
              </div>
            );
          })}
          {placed.map(({ m, topPct, heightPct, continuation, lane, lanes }, idx) => {
            // Side-by-side lanes (was full-width — overlapping day events used
            // to stack on top of each other).
            const widthPct = 100 / lanes;
            const leftPct = lane * widthPct;
            return (
              <div
                key={`${m.id}-${idx}`}
                className="absolute"
                style={{
                  top: `${topPct}%`,
                  height: `${heightPct}%`,
                  left: `calc(${leftPct}% + 8px)`,
                  width: `calc(${widthPct}% - 16px)`,
                }}
              >
                <CalendarEventBar
                  status={m.status}
                  title={m.title}
                  time={formatRange(m.planned_period.start, m.planned_period.end)}
                  continuation={continuation}
                  onClick={() => onSelect(m.id)}
                  className={cn("h-full")}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
