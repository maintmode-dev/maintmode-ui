// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CalendarEvent, MaintenanceStatus } from "@/domain/maintenance/maintenance";

import { CalendarSidebar } from "../calendar-sidebar";
import { type CalendarFilterState } from "../calendar-filters";

const NOW = new Date("2026-06-23T12:00:00Z");

/**
 * The sidebar owns its clock (`useNow`) rather than taking a `now` prop
 * (RUK-265), so tests drive it through the system clock instead of injecting a
 * value. The fake timers MUST be installed before any render: `useNow` captures
 * its initial value lazily DURING render, so a `setSystemTime` after mount would
 * change nothing.
 */
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

// This config has no global testing-library auto-cleanup, so unmount between
// tests to keep the document free of stale renders.
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// The sidebar reads the display timezone via `useTimezone` → `useMeQuery`, so it
// needs a QueryClient in scope. `/me` never resolves here (no bffFetch mock), so
// the zone stays the UTC fallback — which is exactly what these status-chip
// assertions want (they don't touch times).
function renderSidebar(
  statuses: MaintenanceStatus[],
  onFiltersChange = vi.fn(),
  items: CalendarEvent[] = [],
) {
  const filters: CalendarFilterState = {
    statuses: new Set(statuses),
    scope: "all",
    resourceIds: new Set(),
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CalendarSidebar
        items={items}
        filters={filters}
        onFiltersChange={onFiltersChange}
        onSelect={() => {}}
      />
    </QueryClientProvider>,
  );
  return onFiltersChange;
}

/** The status chip button whose accessible name equals the label. */
const chip = (label: string) => screen.getByRole("button", { name: label }) as HTMLButtonElement;

describe("CalendarSidebar status chips", () => {
  it("refuses to clear the last active status (guards the empty-set = 'show all' trap)", () => {
    // Only Planned active: an empty status set sends no `statuses` param, which
    // the backend reads as "all statuses" — so this click must be a no-op.
    const onChange = renderSidebar(["planned"]);
    const planned = chip("Planned");
    expect(planned.disabled).toBe(true);
    fireEvent.click(planned);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes a non-last status and leaves the survivor locked", () => {
    const onChange = renderSidebar(["planned", "in_progress"]);
    // Two active → both enabled.
    expect(chip("Planned").disabled).toBe(false);
    expect(chip("In progress").disabled).toBe(false);
    fireEvent.click(chip("In progress"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as CalendarFilterState;
    expect([...next.statuses].sort()).toEqual(["planned"]);
  });

  it("adds an inactive status (the guard never blocks additions)", () => {
    const onChange = renderSidebar(["planned"]);
    fireEvent.click(chip("Draft"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as CalendarFilterState;
    expect([...next.statuses].sort()).toEqual(["draft", "planned"]);
  });
});

/**
 * The clock still drives the list (RUK-265 AC-7).
 *
 * This is the load-bearing guard for moving the tick into the sidebar. Without
 * it, a `useNow` that ticks but returns an equal-valued `Date`, or one memoised
 * against a stale dependency, would leave "Up next" frozen — and nothing else in
 * the suite would notice, because the "Today" line is `formatDate`, which is
 * DATE-only: a minute (or an hour) of advance renders a byte-identical string.
 *
 * So the assertion is on ORDERING, which `upcomingItems` recomputes from `now`
 * at minute granularity.
 */
describe("CalendarSidebar Up next tracks the clock", () => {
  const event = (id: string, title: string, start: string, end: string): CalendarEvent =>
    ({
      id,
      title,
      status: "planned",
      resources: [],
      planned_period: { start, end },
    }) as unknown as CalendarEvent;

  it("brings an event into the window as the clock advances into its day", () => {
    // `upcomingItems` keeps an item if it is running NOW, or if it STARTS within
    // today/tomorrow (UTC). So a finished event only leaves the list when the
    // day window itself slides past its start — which is the clock doing work no
    // static `now` could do.
    //
    // Note the boundary crossed here is the UTC one, matching `startOfDay` in
    // calendar-filters.ts; the "Today" line formats in the operator zone, which
    // is why this asserts on list membership rather than on that string.
    const items = [
      event("m-1", "Starting soon", "2026-06-23T11:00:00Z", "2026-06-23T12:30:00Z"),
      event("m-2", "Later today", "2026-06-25T09:00:00Z", "2026-06-25T10:00:00Z"),
    ];
    renderSidebar(["planned"], vi.fn(), items);

    // At 12:00 on the 23rd: the first is upcoming today, the second is 2 days
    // out and therefore outside the today/tomorrow window.
    expect(screen.queryByText("Starting soon")).not.toBeNull();
    expect(screen.queryByText("Later today")).toBeNull();

    // Advance 24 h — now the 24th. The 23rd's event is behind the window and the
    // 25th's has entered it. Both halves flip, and only a live clock flips them.
    act(() => {
      vi.advanceTimersByTime(24 * 60 * 60_000);
    });

    expect(screen.queryByText("Starting soon")).toBeNull();
    expect(screen.queryByText("Later today")).not.toBeNull();
  });
});
