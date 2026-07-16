// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MaintenanceStatus } from "@/domain/maintenance/maintenance";

import { CalendarSidebar } from "../calendar-sidebar";
import { type CalendarFilterState } from "../calendar-filters";

// This config has no global testing-library auto-cleanup, so unmount between
// tests to keep the document free of stale renders.
afterEach(() => cleanup());

const NOW = new Date(2026, 5, 23, 12, 0);

// The sidebar now reads the display timezone via `useTimezone` → `useMeQuery`,
// so it needs a QueryClient in scope. `/me` never resolves here (no bffFetch
// mock), so the zone stays the UTC fallback — which is exactly what these
// status-chip assertions want (they don't touch times).
function renderSidebar(statuses: MaintenanceStatus[], onFiltersChange = vi.fn()) {
  const filters: CalendarFilterState = {
    statuses: new Set(statuses),
    scope: "all",
    resourceIds: new Set(),
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CalendarSidebar
        items={[]}
        filters={filters}
        onFiltersChange={onFiltersChange}
        now={NOW}
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
