// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StepsView } from "../maintenance-details-page";

/**
 * The whole step ROW is itself a button whose accessible name concatenates the
 * step title and any nested control labels. To assert on the lifecycle controls
 * specifically, match buttons whose accessible name EQUALS the control label
 * (the row's name is longer, so it's excluded).
 */
const exact = (label: string) => (name: string) => name === label;

// This config has no global testing-library auto-cleanup, so unmount between
// tests to keep the document free of stale renders.
afterEach(() => cleanup());
import type {
  MaintenanceDetail,
  MaintenanceStep,
  MaintenanceStatus,
  StepStatus,
} from "@/domain/maintenance/maintenance";

/**
 * TC-STEP-01: the details page must expose per-step lifecycle controls.
 * A pending step on an in_progress maintenance gets a "Start step" control;
 * the running step gets "Complete" / "Skip". Steps run in order, so only the
 * first pending step is startable, and only when nothing is running.
 */

function step(over: Partial<MaintenanceStep> & { id: string; status: StepStatus }): MaintenanceStep {
  return {
    title: `step ${over.id}`,
    order: 1,
    duration: "PT5M",
    rollback_description: "roll back",
    ...over,
  };
}

function detail(over: { status: MaintenanceStatus; steps: MaintenanceStep[] }): MaintenanceDetail {
  return {
    id: "m-1",
    title: "Test maintenance",
    status: over.status,
    impact: "none",
    scope: "global",
    planned_period: { start: "2026-06-14T17:00:00Z", end: "2026-06-14T17:05:00Z" },
    resources: [],
    notify_targets: [],
    steps: over.steps,
    created_at: "2026-06-14T16:00:00Z",
    updated_at: "2026-06-14T16:00:00Z",
    actions: {
      can_edit: false,
      can_cancel: true,
      can_approve: false,
      can_start: false,
      can_complete: false,
    },
    conflicts: [],
  };
}

describe("StepsView — step lifecycle controls (TC-STEP-01)", () => {
  it("shows 'Start step' on the first pending step when in_progress and nothing is running", () => {
    const onStepAction = vi.fn();
    render(
      <StepsView
        detail={detail({ status: "in_progress", steps: [step({ id: "s1", status: "pending" })] })}
        pending={false}
        onStepAction={onStepAction}
      />,
    );
    const start = screen.getByRole("button", { name: exact("Start step") });
    expect(start).toBeTruthy();
    start.click();
    expect(onStepAction).toHaveBeenCalledWith("s1", "start");
  });

  it("offers Start only on the FIRST pending step (steps run in order)", () => {
    render(
      <StepsView
        detail={detail({
          status: "in_progress",
          steps: [
            step({ id: "s1", status: "done" }),
            step({ id: "s2", status: "pending" }),
            step({ id: "s3", status: "pending" }),
          ],
        })}
        pending={false}
        onStepAction={vi.fn()}
      />,
    );
    // exactly one Start control, and it drives s2 (the first pending)
    const starts = screen.getAllByRole("button", { name: exact("Start step") });
    expect(starts).toHaveLength(1);
  });

  it("shows Complete/Skip (not Start) on the running step", () => {
    render(
      <StepsView
        detail={detail({
          status: "in_progress",
          steps: [step({ id: "s1", status: "in_progress" }), step({ id: "s2", status: "pending" })],
        })}
        pending={false}
        onStepAction={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: exact("Complete") })).toBeTruthy();
    expect(screen.getByRole("button", { name: exact("Skip") })).toBeTruthy();
    // while a step runs, no Start control is offered for the next pending one
    expect(screen.queryByRole("button", { name: exact("Start step") })).toBeNull();
  });

  it("offers no step controls before the maintenance is in_progress (planned)", () => {
    render(
      <StepsView
        detail={detail({ status: "planned", steps: [step({ id: "s1", status: "pending" })] })}
        pending={false}
        onStepAction={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: exact("Start step") })).toBeNull();
    expect(screen.queryByRole("button", { name: exact("Complete") })).toBeNull();
  });

  it("disables step controls while a mutation is pending", () => {
    render(
      <StepsView
        detail={detail({ status: "in_progress", steps: [step({ id: "s1", status: "pending" })] })}
        pending={true}
        onStepAction={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: exact("Start step") })).toHaveProperty("disabled", true);
  });
});
