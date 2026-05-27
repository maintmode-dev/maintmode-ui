"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { CalendarEmpty, CalendarError, CalendarLoading } from "@/shared/ui/states";
import { Button } from "@/shared/ui/shadcn/button";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/shadcn/tabs";
import { cn } from "@/shared/ui/lib/cn";
import { formatDate } from "@/shared/ui/lib/format";

import { CalendarWeekGrid } from "./calendar-week-grid";
import { useCalendarQuery } from "./queries/use-calendar-query";
import { MaintenanceQuickSheet } from "@/features/maintenance/maintenance-quick-sheet";

type View = "day" | "week" | "month";

function startOfWeek(d: Date): Date {
  const out = new Date(d);
  const day = (out.getDay() + 6) % 7; // Monday start
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - day);
  return out;
}

export function CalendarPage() {
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Exclusive upper bound: anchor + 7 days at 00:00. The backend treats
  // this as a half-open interval [weekStart, weekEnd) — events that start
  // before weekEnd are in the window, events that start at exactly
  // weekEnd belong to the following week.
  const weekEnd = useMemo(() => {
    const d = new Date(anchor);
    d.setDate(d.getDate() + 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [anchor]);

  // Label-only date for the header (last day of the visible week).
  const weekLastDay = useMemo(() => {
    const d = new Date(anchor);
    d.setDate(d.getDate() + 6);
    return d;
  }, [anchor]);

  const query = useCalendarQuery({
    weekStart: anchor.toISOString(),
    weekEnd: weekEnd.toISOString(),
  });

  const items = query.data ?? [];
  const status: "loading" | "error" | "ready" = query.isPending
    ? "loading"
    : query.isError
      ? "error"
      : "ready";

  return (
    <div className="mx-auto max-w-[1400px] p-6 space-y-4">
      <header className="flex items-center gap-3 flex-wrap">
        <h1 className="h1">Calendar</h1>
        <div className="flex items-center gap-1 ml-2">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous"
            onClick={() => {
              const d = new Date(anchor);
              d.setDate(d.getDate() - 7);
              setAnchor(d);
            }}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <span className="px-2 text-sm font-medium tabular-nums min-w-[200px] text-center">
            {formatDate(anchor.toISOString())} — {formatDate(weekLastDay.toISOString())},{" "}
            {anchor.getFullYear()}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next"
            onClick={() => {
              const d = new Date(anchor);
              d.setDate(d.getDate() + 7);
              setAnchor(d);
            }}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAnchor(startOfWeek(new Date()))}>
            Today
          </Button>
        </div>
        <Tabs value={view} onValueChange={(v) => setView(v as View)} className="ml-2">
          <TabsList>
            <TabsTrigger value="day" disabled title="Day view ships with a follow-up ticket">
              Day
            </TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month" disabled title="Month view ships with a follow-up ticket">
              Month
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="ml-auto">
          <Button size="sm">
            <Plus className="size-3.5" aria-hidden="true" /> New maintenance
          </Button>
        </div>
      </header>

      <div className="relative">
        {status === "loading" ? (
          <CalendarLoading />
        ) : status === "error" ? (
          <CalendarError onRetry={() => query.refetch()} />
        ) : items.length === 0 ? (
          <div className={cn("relative", "opacity-40 pointer-events-none")}>
            <CalendarWeekGrid anchor={anchor} items={[]} onSelect={() => undefined} />
            <div className="absolute inset-0 grid place-items-center pointer-events-auto">
              <div className="bg-bg-elev-1 border border-border rounded-md shadow-md">
                <CalendarEmpty />
              </div>
            </div>
          </div>
        ) : (
          <CalendarWeekGrid anchor={anchor} items={items} onSelect={setSelectedId} />
        )}
      </div>

      <MaintenanceQuickSheet
        maintenanceId={selectedId}
        open={selectedId !== null}
        onOpenChange={(o) => !o && setSelectedId(null)}
      />
    </div>
  );
}
