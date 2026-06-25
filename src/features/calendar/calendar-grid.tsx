"use client";

import { useEffect, useMemo, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, EventContentArg } from "@fullcalendar/core";

import { CalendarEventBar } from "@/shared/ui/domain/calendar-event-bar";
import type { Maintenance } from "@/domain/maintenance/maintenance";

import { maintenanceToEvent, VIEW_TO_FC, type CalendarEventProps } from "./event-mapping";
import { toDateParam, type CalendarView } from "./view-range";
import "./calendar-grid.css";

export interface CalendarGridProps {
  view: CalendarView;
  /** Canonical anchor for the visible period (owned by the page / view-range). */
  anchor: Date;
  items: Maintenance[];
  onSelect: (id: string) => void;
}

/**
 * Initial scroll position for the Day/Week timegrid: two hours before "now"
 * in UTC, so a fresh load lands near the current time instead of 00:00.
 * FullCalendar's `nowIndicator` auto-scroll handles the rest, but `scrollTime`
 * gives a stable default.
 */
function scrollTimeUtc(now: Date): string {
  const h = Math.max(0, now.getUTCHours() - 2);
  return `${String(h).padStart(2, "0")}:00:00`;
}

/**
 * Single controlled FullCalendar instance backing all three views. The page
 * owns `view` + `anchor` (via view-range.ts) and the header toolbar, so this
 * component runs `headerToolbar:false` and is driven imperatively: a `useEffect`
 * pushes `view`/`anchor` into the FullCalendar API. We deliberately do NOT read
 * `datesSet` back into page state — the page is the single writer, which avoids
 * a navigation feedback loop (double-stepping on prev/next).
 */
export function CalendarGrid({ view, anchor, items, onSelect }: CalendarGridProps) {
  const ref = useRef<FullCalendar | null>(null);
  const events = useMemo(() => items.map(maintenanceToEvent), [items]);
  // Stable within a mount; the page's live clock drives the header, not this.
  const scrollTime = useMemo(() => scrollTimeUtc(new Date()), []);
  // The page's anchor is a LOCAL-midnight Date (per view-range.ts). With the
  // grid in UTC, handing that instant straight to FullCalendar would shift the
  // landing day back across the local→UTC midnight boundary (e.g. local 00:00
  // → 21:00Z the previous day). Anchor on the calendar DATE string instead —
  // the same `YYYY-MM-DD` the query already uses — so the visible day matches
  // the header regardless of the operator's timezone.
  const fcDate = toDateParam(anchor);

  // Push external view/anchor into the FullCalendar API. changeView + gotoDate
  // are idempotent, so re-running on either change keeps the grid in sync with
  // the page without remounting (which would lose scroll position).
  //
  // Deferred to a microtask so the imperative FullCalendar mutation runs AFTER
  // React's commit phase, not inside it. FullCalendar re-renders its events
  // synchronously and its React adapter calls `flushSync` for our JSX
  // `eventContent`; doing that during the effect's commit triggers React's
  // "flushSync was called from inside a lifecycle method" warning. The microtask
  // is the standard escape hatch. `cancelled` guards a unmount/re-run that lands
  // before the microtask fires, so we never touch a stale API.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const api = ref.current?.getApi();
      if (!api) return;
      const fcView = VIEW_TO_FC[view];
      if (api.view.type !== fcView) api.changeView(fcView);
      api.gotoDate(fcDate);
    });
    return () => {
      cancelled = true;
    };
  }, [view, fcDate]);

  // Reuses the shared CalendarEventBar so status colours/markup match the rest
  // of the app. Returning JSX from `eventContent` makes FullCalendar's React
  // adapter call `flushSync` on re-render; the navigation effect above defers
  // its API calls to a microtask so that flushSync never runs inside React's
  // commit phase (which is what would log the "flushSync from inside a lifecycle
  // method" warning).
  const renderEvent = (arg: EventContentArg) => {
    const { status } = arg.event.extendedProps as CalendarEventProps;
    return (
      <CalendarEventBar
        status={status}
        title={arg.event.title}
        // FullCalendar formats the time in the grid's timezone (UTC); empty in
        // month "all-day-ish" rows, so coerce "" → undefined to drop the slot.
        time={arg.timeText || undefined}
        compact
        className="h-full"
      />
    );
  };

  const handleClick = (arg: EventClickArg) => {
    arg.jsEvent.preventDefault();
    onSelect(arg.event.id);
  };

  return (
    <div className="bg-bg-elev-1 border border-border-subtle rounded-md overflow-hidden p-1">
      <FullCalendar
        ref={ref}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={VIEW_TO_FC[view]}
        initialDate={fcDate}
        timeZone="UTC"
        headerToolbar={false}
        firstDay={1}
        nowIndicator
        scrollTime={scrollTime}
        allDaySlot={false}
        // Month (dayGrid) caps rows and shows a native "+N more" popover.
        // Day/Week (timegrid) do NOT cap stacking: capping there silently hid
        // events with no usable overflow affordance (FC's timegrid popover can't
        // be cleanly themed/positioned for hundreds of overlaps), which is worse
        // than letting a busy slot pack tightly. So no eventMaxStack here.
        dayMaxEventRows={5}
        moreLinkClick="popover"
        // Spanning (multi-day) events sort above timed single-day ones, per the
        // month-packing contract; "-duration" puts longer events first.
        // `eventOrderStrict` forbids FullCalendar from re-ordering events to fill
        // vertical gaps — without it the packer could float a timed single-day
        // event above a spanning one (violating the contract's "spanning first"
        // + deterministic-layout rules).
        eventOrder="-duration,start,title"
        eventOrderStrict
        // Bound the grid to the viewport (minus the app bar + page header/toolbar
        // chrome) so FullCalendar renders its OWN internal scroller instead of
        // growing to full content height and scrolling the whole page. A CSS
        // string with viewport units works without the parent needing a defined
        // height. `expandRows` still fills the box when content is short.
        height="calc(100vh - 13rem)"
        expandRows
        events={events}
        eventContent={renderEvent}
        eventClick={handleClick}
        slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
      />
    </div>
  );
}
