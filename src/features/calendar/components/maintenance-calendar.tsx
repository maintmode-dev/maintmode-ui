"use client";

import { useEffect, useMemo, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import type { EventClickArg } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";

import type { MaintenanceSummary } from "@/domain/maintenance/models/maintenance";
import { MAINTENANCE_STATUS_COLORS } from "@/domain/maintenance/rules/status";
import {
  parseLocalDateParam,
  type CalendarViewMode,
} from "@/features/calendar/lib/calendar-navigation";
import "@/features/calendar/styles/fullcalendar.css";

const VIEW_TO_PLUGIN: Record<CalendarViewMode, string> = {
  month: "dayGridMonth",
  week: "timeGridWeek",
  day: "timeGridDay",
};

type MaintenanceCalendarProps = {
  view: CalendarViewMode;
  date: string;
  maintenances: MaintenanceSummary[];
  onSelectMaintenance: (id: string) => void;
};

export function MaintenanceCalendar({ view, date, maintenances, onSelectMaintenance }: MaintenanceCalendarProps) {
  const calendarRef = useRef<FullCalendar | null>(null);
  const events = useMemo(() => maintenances.map(toCalendarEvent), [maintenances]);

  // Keep FullCalendar's internal navigation in sync with the URL-driven
  // state. Wrap both updates in `batchRendering` (still supported on the
  // underlying `Calendar` instance even though it is missing from the
  // public `CalendarApi` types) so the grid does not re-layout twice on
  // a single user interaction.
  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) {
      return;
    }
    const parsed = parseLocalDateParam(date);
    const apply = () => {
      if (parsed) {
        api.gotoDate(parsed);
      }
      api.changeView(VIEW_TO_PLUGIN[view]);
    };
    const batched = (api as { batchRendering?: (fn: () => void) => void }).batchRendering;
    if (typeof batched === "function") {
      batched.call(api, apply);
    } else {
      apply();
    }
  }, [view, date]);

  const handleEventClick = (event: EventClickArg) => {
    event.jsEvent.preventDefault();
    if (event.event.id) {
      onSelectMaintenance(event.event.id);
    }
  };

  return (
    <div className="flex-1 overflow-hidden bg-[var(--surface)] p-3" data-testid="maintenance-calendar">
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={VIEW_TO_PLUGIN[view]}
        initialDate={date}
        height="100%"
        firstDay={1}
        headerToolbar={false}
        dayMaxEventRows={3}
        eventOrder={["allDay", "start", "title"]}
        events={events}
        eventClick={handleEventClick}
        nowIndicator
      />
    </div>
  );
}

function toCalendarEvent(maintenance: MaintenanceSummary) {
  const colors = MAINTENANCE_STATUS_COLORS[maintenance.status];
  return {
    id: maintenance.id,
    title: maintenance.title,
    start: maintenance.planned_start_at,
    end: maintenance.planned_end_at,
    backgroundColor: colors.bg,
    borderColor: maintenance.has_conflict ? "#d92d20" : colors.border,
    textColor: colors.text,
    extendedProps: {
      status: maintenance.status,
      hasConflict: maintenance.has_conflict,
    },
  };
}

