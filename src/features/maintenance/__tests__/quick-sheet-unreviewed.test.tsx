// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Conflict, MaintenanceDetail, MaintenanceStatus } from "@/domain/maintenance/maintenance";

/**
 * The last unwired call site (RUK-178).
 *
 * `isUnreviewedConflict` is unit-tested in the domain and `ConflictRow` is
 * tested in isolation, but nothing rendered a REAL quick sheet with a non-empty
 * conflicts array — the details-page test mocks the sheet away and the
 * approvals-page fixture has no conflicts. So the one thing left untested was
 * the wiring at `maintenance-quick-sheet.tsx`: that `detail.status` (not some
 * other value) is passed, in the right argument order, and that the result
 * actually reaches the row.
 */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const detailData = vi.fn<() => MaintenanceDetail>();
vi.mock("../queries/use-maintenance-detail-query", () => ({
  useMaintenanceDetailQuery: () => ({ data: detailData(), isPending: false, isError: false }),
}));
vi.mock("../queries/use-maintenance-actions", () => ({
  useMaintenanceAction: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/features/_shared/timezone/use-timezone", () => ({
  useTimezone: () => ({ zone: "UTC", ready: true }),
}));

import { MaintenanceQuickSheet } from "../maintenance-quick-sheet";

const MARKER = "Not seen at approval";

function conflict(over: Partial<Conflict> & { maintenance_id: string; title: string }): Conflict {
  return {
    overlap_start: "2026-07-29T17:00:00Z",
    overlap_end: "2026-07-29T17:30:00Z",
    scope: "global",
    resources: [],
    known_at_approval: false,
    ...over,
  };
}

function detail(status: MaintenanceStatus, conflicts: Conflict[]): MaintenanceDetail {
  return {
    id: "m-1",
    title: "Test maintenance",
    status,
    impact: "none",
    scope: "global",
    planned_period: { start: "2026-07-29T17:00:00Z", end: "2026-07-29T17:05:00Z" },
    resources: [],
    notify_targets: [],
    reminders: [],
    steps: [],
    created_at: "2026-07-29T16:00:00Z",
    updated_at: "2026-07-29T16:00:00Z",
    actions: {
      can_edit: false,
      can_cancel: false,
      can_approve: false,
      can_start: false,
      can_complete: false,
    },
    conflicts,
  };
}

const MIXED: Conflict[] = [
  conflict({ maintenance_id: "m-new", title: "Unreviewed neighbour", known_at_approval: false }),
  conflict({ maintenance_id: "m-seen", title: "Seen neighbour", known_at_approval: true }),
];

function open(d: MaintenanceDetail) {
  detailData.mockReturnValue(d);
  render(<MaintenanceQuickSheet maintenanceId="m-1" open onOpenChange={() => {}} />);
}

describe("quick sheet — unreviewed conflicts", () => {
  it("marks the unreviewed conflict and leaves the reviewed one alone", () => {
    open(detail("planned", MIXED));

    // Exactly one marker, and it must belong to the false one — a wiring that
    // passed the wrong conflict would still produce a count of 1.
    const markers = screen.getAllByText(MARKER);
    expect(markers).toHaveLength(1);
    expect(markers[0].closest("div")?.parentElement?.textContent).toContain("Unreviewed neighbour");
  });

  it("marks nothing on a draft, where every conflict reads false", () => {
    // Catches an inverted or dropped status argument: with the wrong value
    // passed, this all-false fixture would render two markers.
    open(
      detail("draft", [
        conflict({ maintenance_id: "m-a", title: "Draft neighbour A" }),
        conflict({ maintenance_id: "m-b", title: "Draft neighbour B" }),
      ]),
    );

    expect(screen.queryByText(MARKER)).toBeNull();
    // Sanity: the rows did render, so the absence above is the gate working.
    expect(screen.getByText("Draft neighbour A")).toBeTruthy();
  });
});
