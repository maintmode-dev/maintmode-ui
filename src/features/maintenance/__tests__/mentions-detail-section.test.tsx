// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MaintenanceDetail, MaintenanceMention } from "@/domain/maintenance/maintenance";

/**
 * AC-09 (RUK-218): the maintenance detail page shows who was mentioned, as
 * plain name chips in "Impact & targets" — no messenger-tag icon (the read
 * model deliberately carries none, §1.3).
 *
 * The section is absent when nobody is tagged (`[]`) AND when the backend
 * predates mentions (`undefined`) — a deliberate divergence from the neighbouring
 * Resources / Notify channels sections, which render `—` when empty.
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
// The cancel dialog and the conflict quick-sheet stay mounted on the page even
// while closed, and each pulls its own query — stub them so the render needs no
// QueryClient.
vi.mock("../queries/use-cancel-reasons-query", () => ({
  useCancelReasonsQuery: () => ({ data: [], isPending: false }),
}));
vi.mock("../maintenance-quick-sheet", () => ({
  MaintenanceQuickSheet: () => null,
}));
// The page formats its windows through `useTimezone` (→ useMeQuery); a ready UTC
// zone keeps the test off a QueryClient and focused on the mentions section.
vi.mock("@/features/_shared/timezone/use-timezone", () => ({
  useTimezone: () => ({ zone: "UTC", ready: true }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { MaintenanceDetailsPage } from "../maintenance-details-page";

function detail(mentions: MaintenanceMention[] | undefined): MaintenanceDetail {
  return {
    id: "m-1",
    title: "Test maintenance",
    status: "planned",
    impact: "none",
    scope: "global",
    planned_period: { start: "2026-07-29T17:00:00Z", end: "2026-07-29T17:05:00Z" },
    resources: [],
    notify_targets: [],
    reminders: [],
    steps: [],
    mentions,
    created_at: "2026-07-29T16:00:00Z",
    updated_at: "2026-07-29T16:00:00Z",
    actions: {
      can_edit: false,
      can_cancel: false,
      can_approve: false,
      can_start: false,
      can_complete: false,
    },
    conflicts: [],
  };
}

describe("maintenance detail — Mentions section (AC-09)", () => {
  it("renders a name chip per mention", () => {
    detailData.mockReturnValue(
      detail([
        { user_id: "u-1", display_name: "Alice Ops" },
        { user_id: "u-2", display_name: "Bob Networks" },
      ]),
    );
    render(<MaintenanceDetailsPage id="m-1" />);
    expect(screen.getByText("Mentions")).toBeTruthy();
    expect(screen.getByText("Alice Ops")).toBeTruthy();
    expect(screen.getByText("Bob Networks")).toBeTruthy();
  });

  it("omits the section entirely when nobody is tagged (empty array)", () => {
    detailData.mockReturnValue(detail([]));
    render(<MaintenanceDetailsPage id="m-1" />);
    expect(screen.queryByText("Mentions")).toBeNull();
    // sanity: the sibling section that DOES render `—` when empty is present,
    // so absence above is about mentions, not a failed render.
    expect(screen.getByText("Notify channels")).toBeTruthy();
  });

  it("omits the section when the backend predates mentions (undefined)", () => {
    detailData.mockReturnValue(detail(undefined));
    render(<MaintenanceDetailsPage id="m-1" />);
    expect(screen.queryByText("Mentions")).toBeNull();
    expect(screen.getByText("Notify channels")).toBeTruthy();
  });

  it("renders the backend's 'Unknown user' fallback as-is", () => {
    detailData.mockReturnValue(detail([{ user_id: "u-3", display_name: "Unknown user" }]));
    render(<MaintenanceDetailsPage id="m-1" />);
    expect(screen.getByText("Mentions")).toBeTruthy();
    expect(screen.getByText("Unknown user")).toBeTruthy();
  });
});
