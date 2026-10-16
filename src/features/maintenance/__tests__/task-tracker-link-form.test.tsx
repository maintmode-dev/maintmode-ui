// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MaintenanceDetail } from "@/domain/maintenance/maintenance";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

/**
 * The task tracker link in the maintenance form. What the form hands the
 * mutation decides the update's tri-state on the wire: `undefined` leaves the
 * saved link alone, `""` clears it, a URL replaces it. So each case asserts the
 * exact `task_tracker_url` in the submitted input, not just that a submit
 * happened.
 */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const createMutate = vi.fn();
const updateMutate = vi.fn();

vi.mock("../queries/use-assignable-users-query", () => ({
  useAssignableUsersQuery: () => ({ data: [], isPending: false, isError: false }),
}));
vi.mock("../queries/use-mentionable-users-query", () => ({
  useMentionableUsersQuery: () => ({ data: [], isPending: false, isError: false }),
}));
vi.mock("@/features/notify-channels/queries/use-notify-channels-query", () => ({
  useNotifyChannelsQuery: () => ({
    data: { channels: [], limit: 0, offset: 0, total: 0 },
    isPending: false,
  }),
}));
vi.mock("@/features/resources/queries/use-resources-query", () => ({
  useResourcesQuery: () => ({ data: { resources: [] }, isPending: false }),
}));
vi.mock("../queries/use-maintenance-draft", () => ({
  useCreateMaintenance: () => ({ mutate: createMutate, isPending: false }),
  useUpdateMaintenance: () => ({ mutate: updateMutate, isPending: false }),
}));
vi.mock("@/features/_shared/timezone/use-timezone", () => ({
  useTimezone: () => ({ zone: "UTC", ready: true }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { MaintenanceEditMode } from "../maintenance-edit-mode";

/**
 * A draft that passes every other rule of the form, so a blocked submit can only
 * be the link's doing. `task_tracker_url` is passed explicitly, `undefined`
 * included — its absence is the old-backend signal the form keys off.
 */
function draft(task_tracker_url: string | undefined): MaintenanceDetail {
  return {
    id: "m-1",
    title: "DB index migration",
    description: "Rebuild the index",
    status: "draft",
    impact: "none",
    scope: "global",
    planned_period: { start: "2099-01-01T10:00:00Z", end: "2099-01-01T11:00:00Z" },
    resources: [],
    notify_targets: [{ id: "c-1", name: "maint: events", transport: "telegram" }],
    steps: [
      {
        id: "s-1",
        title: "Rebuild",
        description: "Rebuild the index",
        rollback_description: "Drop the new index",
        duration: "30m",
        status: "pending",
      },
    ],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    actions: { can_edit: true, can_cancel: true, can_approve: false, can_start: false, can_complete: false },
    conflicts: [],
    reminders: [],
    mentions: [],
    task_tracker_url,
  };
}

const field = () => screen.getByLabelText("Task tracker link") as HTMLInputElement;
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
const submittedUrl = () => updateMutate.mock.calls[0][0].input.task_tracker_url;

describe("maintenance form — task tracker link", () => {
  it("hydrates the field from the saved link and sends it back unchanged", async () => {
    render(
      <MaintenanceEditMode detail={draft("https://jira.example.com/browse/OPS-42")} onClose={() => {}} />,
    );
    expect(field().value).toBe("https://jira.example.com/browse/OPS-42");

    save();

    await waitFor(() => expect(updateMutate).toHaveBeenCalled());
    expect(submittedUrl()).toBe("https://jira.example.com/browse/OPS-42");
  });

  // THE edit case: emptying the field must clear the link, which on the wire is
  // `""` — `undefined` would read as "leave unchanged" and keep the old one.
  it('sends "" when the operator empties the field', async () => {
    render(
      <MaintenanceEditMode detail={draft("https://jira.example.com/browse/OPS-42")} onClose={() => {}} />,
    );

    fireEvent.change(field(), { target: { value: "" } });
    save();

    await waitFor(() => expect(updateMutate).toHaveBeenCalled());
    expect(submittedUrl()).toBe("");
  });

  // The backend does not trim and 400s a padded value.
  it("trims the link before submitting it", async () => {
    render(<MaintenanceEditMode detail={draft("")} onClose={() => {}} />);

    fireEvent.change(field(), { target: { value: "  https://x.io/t/1  " } });
    save();

    await waitFor(() => expect(updateMutate).toHaveBeenCalled());
    expect(submittedUrl()).toBe("https://x.io/t/1");
  });

  it("blocks the submit on a link the backend would refuse, and says why", async () => {
    render(<MaintenanceEditMode detail={draft("")} onClose={() => {}} />);

    fireEvent.change(field(), { target: { value: "javascript:alert(1)" } });
    save();

    await waitFor(() =>
      expect(screen.getByText("Must be an absolute http:// or https:// link.")).toBeTruthy(),
    );
    expect(field().getAttribute("aria-invalid")).toBe("true");
    expect(updateMutate).not.toHaveBeenCalled();
  });

  // No key means a backend that would accept the link with a 200 and drop it.
  // Hidden, the form sends `undefined`, which leaves any saved link untouched.
  it("hides the field and leaves the link untouched when the backend predates it", async () => {
    render(<MaintenanceEditMode detail={draft(undefined)} onClose={() => {}} />);
    expect(screen.queryByLabelText("Task tracker link")).toBeNull();

    save();

    await waitFor(() => expect(updateMutate).toHaveBeenCalled());
    expect(submittedUrl()).toBeUndefined();
  });

  it("offers the field on create, where there is no detail to read support from", () => {
    render(<MaintenanceEditMode creating onClose={() => {}} />);

    expect(field().value).toBe("");
  });
});
