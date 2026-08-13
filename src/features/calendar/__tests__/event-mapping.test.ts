import { describe, expect, it } from "vitest";

import type { CalendarEvent, MaintenanceStatus } from "@/domain/maintenance/maintenance";

import { maintenanceToEvent, VIEW_TO_FC } from "../event-mapping";

function mk(
  id: string,
  opts: { status?: MaintenanceStatus; start?: string; end?: string } = {},
): CalendarEvent {
  const start = opts.start ?? "2026-06-08T10:00:00Z";
  const end = opts.end ?? "2026-06-08T12:00:00Z";
  return {
    id,
    title: `Title ${id}`,
    status: opts.status ?? "planned",
    impact: "none",
    scope: "global",
    planned_period: { start, end },
    resources: [],
  };
}

describe("maintenanceToEvent", () => {
  it("maps id/title/start/end from the planned period", () => {
    const e = maintenanceToEvent(mk("m1", { start: "2026-06-08T09:30:00Z", end: "2026-06-08T11:00:00Z" }));
    expect(e.id).toBe("m1");
    expect(e.title).toBe("Title m1");
    expect(e.start).toBe("2026-06-08T09:30:00Z");
    expect(e.end).toBe("2026-06-08T11:00:00Z");
  });

  it("carries status in extendedProps for the bar colour", () => {
    const e = maintenanceToEvent(mk("m2", { status: "in_progress" }));
    expect(e.extendedProps).toEqual({ status: "in_progress" });
  });

  it("does not set allDay (every maintenance is a timed range)", () => {
    const e = maintenanceToEvent(mk("m3"));
    expect(e.allDay).toBeUndefined();
  });

  it("passes a multi-day span through verbatim (FullCalendar derives spanning)", () => {
    // Spanning events are the centre of the month-packing contract: the mapper
    // must not clamp or split them — it hands the raw start/end to FullCalendar,
    // which renders the continuous bar and sorts it above timed single-day ones.
    const e = maintenanceToEvent(mk("m4", { start: "2026-06-08T22:00:00Z", end: "2026-06-10T03:00:00Z" }));
    expect(e.start).toBe("2026-06-08T22:00:00Z");
    expect(e.end).toBe("2026-06-10T03:00:00Z");
    expect(e.allDay).toBeUndefined();
  });
});

describe("VIEW_TO_FC", () => {
  it("maps project views onto FullCalendar view names", () => {
    expect(VIEW_TO_FC).toEqual({
      day: "timeGridDay",
      week: "timeGridWeek",
      month: "dayGridMonth",
    });
  });
});
