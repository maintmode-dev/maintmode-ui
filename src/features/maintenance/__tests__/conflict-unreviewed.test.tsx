// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Conflict, MaintenanceDetail, MaintenanceStatus } from "@/domain/maintenance/maintenance";

/**
 * AC-07 / AC-08 / AC-09 / AC-12 (RUK-178): the detail page marks conflicts the
 * approver never saw.
 *
 * Every fixture here is deliberately asymmetric. A set of all-`false`
 * conflicts passes against an implementation that flags everything
 * unconditionally, and a draft with no conflicts passes AC-08 vacuously — so
 * the mixed set and the draft-WITH-conflicts case are what make these tests
 * able to fail.
 */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const detailData = vi.fn<() => MaintenanceDetail>();
vi.mock("../queries/use-maintenance-detail-query", () => ({
  useMaintenanceDetailQuery: () => ({
    data: detailData(),
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("../queries/use-maintenance-actions", () => ({
  useMaintenanceAction: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelMaintenance: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../queries/use-step-actions", () => ({
  useStepAction: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../queries/use-cancel-reasons-query", () => ({
  useCancelReasonsQuery: () => ({ data: [], isPending: false }),
}));
vi.mock("../maintenance-quick-sheet", () => ({ MaintenanceQuickSheet: () => null }));
vi.mock("@/features/_shared/timezone/use-timezone", () => ({
  useTimezone: () => ({ zone: "UTC", ready: true }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { MaintenanceDetailsPage } from "../maintenance-details-page";

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

/** Server order: unreviewed first, then the one the approver saw. */
const MIXED: Conflict[] = [
  conflict({ maintenance_id: "m-new", title: "Unreviewed neighbour", known_at_approval: false }),
  conflict({ maintenance_id: "m-seen", title: "Seen neighbour", known_at_approval: true }),
];

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

describe("maintenance detail — conflicts the approver never saw", () => {
  it("marks only the unreviewed conflict, and marks the right one", () => {
    // AC-07. The count alone would pass against code that marks the WRONG
    // conflict, so walk from the marker up to its card and check whose it is.
    detailData.mockReturnValue(detail("planned", MIXED));
    render(<MaintenanceDetailsPage id="m-1" />);

    const markers = screen.getAllByText(MARKER);
    expect(markers).toHaveLength(1);
    expect(markers[0].closest("article, button")?.textContent).toContain("Unreviewed neighbour");
  });

  it("leaves the conflict the approver saw unmarked", () => {
    detailData.mockReturnValue(detail("planned", MIXED));
    render(<MaintenanceDetailsPage id="m-1" />);

    const seenCard = screen.getByText("Seen neighbour").closest("article, button");
    expect(seenCard?.textContent).not.toContain(MARKER);
  });

  it("preserves the server's unreviewed-first order", () => {
    // AC-09. The backend sorts unreviewed first and the client must not re-sort.
    detailData.mockReturnValue(detail("planned", MIXED));
    render(<MaintenanceDetailsPage id="m-1" />);

    const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(["Unreviewed neighbour", "Seen neighbour"]);
  });

  it("marks nothing on a draft, even though every conflict reads false", () => {
    // AC-08. On a draft nobody has approved yet, so `false` is structural, not
    // a warning. This fixture is all-`false` on purpose: without the status
    // gate the naive check would render two markers here.
    detailData.mockReturnValue(
      detail("draft", [
        conflict({ maintenance_id: "m-a", title: "Draft neighbour A" }),
        conflict({ maintenance_id: "m-b", title: "Draft neighbour B" }),
      ]),
    );
    render(<MaintenanceDetailsPage id="m-1" />);

    expect(screen.queryByText(MARKER)).toBeNull();
    // Sanity: the conflicts really did render, so the absence above is the gate
    // doing its job rather than an empty panel.
    expect(screen.getByText("Draft neighbour A")).toBeTruthy();
  });

  it("never uses the forbidden 'appeared after approval' phrasing", () => {
    // AC-12. The backend cannot know WHY a conflict is unreviewed — the same
    // `false` arrives when its snapshot read fails — so the copy must not
    // assert a cause. Kept as a test so the rule survives a copy edit.
    detailData.mockReturnValue(detail("planned", MIXED));
    render(<MaintenanceDetailsPage id="m-1" />);

    expect(screen.queryByText(/appeared after approval/i)).toBeNull();
  });
});
