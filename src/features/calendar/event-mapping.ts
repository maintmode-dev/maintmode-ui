/**
 * Pure adapters between the domain `Maintenance` shape and FullCalendar's
 * `EventInput`, plus the Day/Week/Month → FullCalendar view-name map. Kept
 * separate from the grid component so the mapping is unit-testable without
 * mounting FullCalendar (which needs a DOM).
 */

import type { EventInput } from "@fullcalendar/core";

import type { Maintenance, MaintenanceStatus } from "@/domain/maintenance/maintenance";
import type { CalendarView } from "./view-range";

/** Project view → FullCalendar view name. */
export const VIEW_TO_FC: Record<CalendarView, string> = {
  day: "timeGridDay",
  week: "timeGridWeek",
  month: "dayGridMonth",
};

/** Status carried on the FullCalendar event so `eventContent` can colour the bar. */
export interface CalendarEventProps {
  status: MaintenanceStatus;
}

/**
 * Map a maintenance window onto a FullCalendar event. `start`/`end` are the
 * planned period (ISO strings; the grid renders them in UTC). The status rides
 * along in `extendedProps` so the custom `eventContent` can pick the status
 * colour without re-fetching. No `allDay` — every maintenance has a concrete
 * time range, and FullCalendar derives multi-day spanning from start/end.
 */
export function maintenanceToEvent(m: Maintenance): EventInput {
  return {
    id: m.id,
    title: m.title,
    start: m.planned_period.start,
    end: m.planned_period.end,
    extendedProps: { status: m.status } satisfies CalendarEventProps,
  };
}
