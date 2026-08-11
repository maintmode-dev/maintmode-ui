// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Maintenance } from "@/domain/maintenance/maintenance";

import { CalendarGrid } from "../calendar-grid";

/**
 * Grid-internals coverage for the product's main screen (route `/`). Until this
 * file existed the only thing exercising `CalendarGrid` was two page-level tests
 * that mount it transitively with an EMPTY window — i.e. the grid never actually
 * rendered an event, and nothing asserted on selection at all.
 *
 * What is covered here is behaviour an operator would notice breaking, not
 * FullCalendar configuration:
 *
 *  - events reach the DOM,
 *  - clicking one selects the right maintenance,
 *  - Enter on a focused event selects it too — a SEPARATE code path through
 *    core's `getSegAnchorAttrs`, not the click handler,
 *  - the "+N more" overflow link appears past `dayMaxEventRows` and opens the
 *    popover,
 *  - an event clicked INSIDE the popover selects it.
 *
 * Deliberately NOT covered: the contents of the `plugins` array. Asserting on it
 * is a tautology — it restates the source line and catches a typo, never a
 * regression in what the grid does.
 *
 * No geometry mocks. `dayMaxEventRows={5}` is an integer, so FullCalendar takes
 * its fixed-row-count path and never measures elements; jsdom's zero-height
 * layout is therefore irrelevant to everything asserted here. (Were it `true`,
 * FC would consult real geometry and none of this would work in jsdom.)
 */

// This config has no global testing-library auto-cleanup, so unmount between
// tests to keep the document free of stale renders.
afterEach(() => cleanup());

/** Month containing the fixtures; anchor is UTC-midnight per view-range.ts. */
const ANCHOR = new Date(Date.UTC(2026, 6, 15));

function maintenance(id: string, title: string, start: string, end: string): Maintenance {
  return {
    id,
    title,
    status: "planned",
    impact: "none",
    scope: "global",
    planned_period: { start, end },
    resources: [],
    notify_targets: [],
    steps: [],
    created_at: start,
    updated_at: start,
  };
}

/** `count` events all landing on the same day, so the day overflows its rows. */
function eventsOnOneDay(count: number, day = "2026-07-15"): Maintenance[] {
  return Array.from({ length: count }, (_, i) =>
    maintenance(
      `m${i}`,
      `Event ${i}`,
      `${day}T${String(i % 24).padStart(2, "0")}:00:00Z`,
      `${day}T${String(i % 24).padStart(2, "0")}:30:00Z`,
    ),
  );
}

function renderGrid(items: Maintenance[], onSelect = vi.fn<(id: string) => void>()) {
  render(<CalendarGrid view="month" anchor={ANCHOR} items={items} onSelect={onSelect} timeZone="UTC" />);
  return onSelect;
}

/** The `.fc-event` whose rendered bar carries `title`. */
function eventEl(title: string): HTMLElement {
  const el = screen.getByText(title).closest(".fc-event");
  if (!el) throw new Error(`No .fc-event ancestor for "${title}"`);
  return el as HTMLElement;
}

describe("CalendarGrid", () => {
  it("renders its events into the grid", () => {
    renderGrid([
      maintenance("m1", "Patch database", "2026-07-15T09:00:00Z", "2026-07-15T10:00:00Z"),
      maintenance("m2", "Rotate certificates", "2026-07-16T09:00:00Z", "2026-07-16T10:00:00Z"),
    ]);

    expect(screen.getByText("Patch database")).toBeTruthy();
    expect(screen.getByText("Rotate certificates")).toBeTruthy();
  });

  it("calls onSelect with the maintenance id when an event is clicked", () => {
    const onSelect = renderGrid([
      maintenance("m1", "Patch database", "2026-07-15T09:00:00Z", "2026-07-15T10:00:00Z"),
      maintenance("m2", "Rotate certificates", "2026-07-16T09:00:00Z", "2026-07-16T10:00:00Z"),
    ]);

    fireEvent.click(eventEl("Rotate certificates"));

    // The id, not the index/title: the quick sheet is opened by id, so a mapping
    // slip here would open the wrong maintenance.
    expect(onSelect.mock.calls).toEqual([["m2"]]);
  });

  it("selects on Enter on a focused event (keyboard path, not the click handler)", () => {
    const onSelect = renderGrid([
      maintenance("m1", "Patch database", "2026-07-15T09:00:00Z", "2026-07-15T10:00:00Z"),
    ]);

    const el = eventEl("Patch database");
    // FullCalendar core makes event segments keyboard-reachable via
    // `getSegAnchorAttrs`. If that ever stops applying, this is the assertion
    // that catches it — the grid would still be clickable and look fine.
    expect(el.getAttribute("tabindex")).toBe("0");

    el.focus();
    fireEvent.keyDown(el, { key: "Enter", code: "Enter" });

    expect(onSelect.mock.calls).toEqual([["m1"]]);
  });

  it("shows a '+N more' link past dayMaxEventRows and opens the popover on click", async () => {
    // 20 events on one day against `dayMaxEventRows={5}`.
    renderGrid(eventsOnOneDay(20));

    const moreLink = document.querySelector(".fc-daygrid-more-link");
    expect(moreLink).not.toBeNull();
    // Not asserting the exact N: it depends on how many rows FC spends on the
    // day cell's own chrome, which is layout-ish. That it OVERFLOWS is the
    // behaviour; the precise remainder is not.
    expect(moreLink!.textContent).toMatch(/^\+\d+ more$/);

    expect(document.querySelector(".fc-popover")).toBeNull();
    fireEvent.click(moreLink!);

    // FullCalendar's own (Preact) state update lands outside React's `act`, so
    // the popover appears a tick after the click — hence `waitFor` rather than a
    // synchronous read.
    const popover = await waitFor(() => {
      const el = document.querySelector(".fc-popover");
      expect(el).not.toBeNull();
      return el!;
    });
    // The popover exists to show what the cell could not — every event on the
    // day must be reachable through it, not just the hidden remainder.
    expect(popover.querySelectorAll(".fc-event")).toHaveLength(20);
  });

  it("selects an event clicked inside the '+N more' popover", async () => {
    const onSelect = renderGrid(eventsOnOneDay(20));

    fireEvent.click(document.querySelector(".fc-daygrid-more-link")!);
    const popover = await waitFor(() => {
      const el = document.querySelector(".fc-popover");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });

    // Popover segments are the same event objects as the grid's, so the id has
    // to round-trip through this path too — it is a distinct render tree, and a
    // selection wired only on the main grid would leave it dead.
    fireEvent.click(within(popover).getByText("Event 3").closest(".fc-event")!);

    expect(onSelect.mock.calls).toEqual([["m3"]]);
  });
});
