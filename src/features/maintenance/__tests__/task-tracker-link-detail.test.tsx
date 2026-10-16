// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MaintenanceDetail } from "@/domain/maintenance/maintenance";

/**
 * The task tracker link on the read side: the details page's Overview card and
 * the quick-sheet peek. Three stored states — a link, `""`, and `undefined` (a
 * backend predating the field) — and one hostile one, a stored value that is not
 * an http(s) URL, which must never become a clickable `href`.
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
vi.mock("@/features/_shared/timezone/use-timezone", () => ({
  useTimezone: () => ({ zone: "UTC", ready: true }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { MaintenanceDetailsPage } from "../maintenance-details-page";
import { MaintenanceQuickSheet } from "../maintenance-quick-sheet";

function detail(task_tracker_url: string | undefined): MaintenanceDetail {
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
    task_tracker_url,
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

const SURFACES = [
  ["details page", () => render(<MaintenanceDetailsPage id="m-1" />)],
  ["quick sheet", () => render(<MaintenanceQuickSheet maintenanceId="m-1" open onOpenChange={() => {}} />)],
] as const;

describe.each(SURFACES)("task tracker link — %s", (_surface, renderSurface) => {
  it("renders the link, opening in a new tab without an opener or referrer", () => {
    detailData.mockReturnValue(detail("https://jira.example.com/browse/OPS-42"));
    renderSurface();

    const link = screen.getByRole("link", { name: /jira\.example\.com/ });
    expect(link.getAttribute("href")).toBe("https://jira.example.com/browse/OPS-42");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")?.split(" ").sort()).toEqual(["noopener", "noreferrer"]);
    expect(screen.getByText("Task")).toBeTruthy();
  });

  // The host is its own node, so a disguised link names where it really goes.
  it("shows the real host of a link disguised as another", () => {
    detailData.mockReturnValue(detail("https://evil.com#@jira.example.com"));
    renderSurface();

    expect(screen.getByText("evil.com")).toBeTruthy();
    expect(screen.queryByText("jira.example.com")).toBeNull();
  });

  it.each([
    ["no link is set", ""],
    ["the backend predates the field", undefined],
  ])("renders nothing when %s", (_case, url) => {
    detailData.mockReturnValue(detail(url));
    renderSurface();

    expect(screen.queryByText("Task")).toBeNull();
    // Sanity: the card rendered, so the absence is about the link.
    expect(screen.getByText("Approver")).toBeTruthy();
  });

  // Validated on write, but re-checked on read: a row from before the rule, or
  // from an endpoint that skips it, must not become a clickable script.
  it("renders a non-http(s) value as inert text, never as an href", () => {
    detailData.mockReturnValue(detail("javascript:alert(1)"));
    renderSurface();

    expect(screen.getByText("javascript:alert(1)")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /alert/ })).toBeNull();
    expect(document.querySelector('a[href^="javascript"]')).toBeNull();
  });
});
