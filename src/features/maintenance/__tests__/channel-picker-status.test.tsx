// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { NotifyChannel } from "@/domain/notify-channel/notify-channel";

// jsdom lacks the layout APIs cmdk (the channel picker) relies on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

/**
 * RUK-200 follow-up: the maintenance form's notify-channel picker
 * (maintenance-edit-mode) must surface transport_status the same way the
 * channel-create picker does — a channel whose integration won't deliver
 * (disabled / not_configured / unreadable) is marked in the option and warned
 * about inline once selected, but stays selectable (weak binding).
 */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// The form pulls from several queries; stub them so we render deterministically
// and drive only the channel-status behaviour.
const channelsData = vi.fn<() => NotifyChannel[]>(() => []);
vi.mock("@/features/notify-channels/queries/use-notify-channels-query", () => ({
  useNotifyChannelsQuery: () => ({ data: channelsData(), isPending: false }),
}));
vi.mock("../queries/use-assignable-users-query", () => ({
  useAssignableUsersQuery: () => ({ data: [], isPending: false }),
}));
vi.mock("@/features/resources/queries/use-resources-query", () => ({
  useResourcesQuery: () => ({ data: { resources: [] }, isPending: false }),
}));
vi.mock("../queries/use-maintenance-draft", () => ({
  useCreateMaintenance: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateMaintenance: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { MaintenanceEditMode } from "../maintenance-edit-mode";

function channel(overrides: Partial<NotifyChannel>): NotifyChannel {
  return {
    id: "c-1",
    name: "maint: events",
    transport: "telegram",
    transportStatus: "ok",
    transportChannelId: "-1004347420382",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "",
    ...overrides,
  };
}

function openChannelPicker() {
  fireEvent.click(screen.getByRole("combobox", { name: "Notify channels" }));
}

describe("maintenance channel picker — transport_status marking (RUK-200)", () => {
  it("marks a disabled channel in the picker with its status badge", async () => {
    channelsData.mockReturnValue([channel({ transportStatus: "disabled" })]);
    render(<MaintenanceEditMode creating onClose={() => undefined} />);
    openChannelPicker();
    await waitFor(() => expect(screen.getByText("maint: events")).toBeTruthy());
    // Status badge replaces the transport·id description line.
    expect(screen.getByText("Integration disabled")).toBeTruthy();
  });

  it("keeps the non-ok channel selectable and warns inline once selected (weak binding)", async () => {
    channelsData.mockReturnValue([channel({ transportStatus: "disabled" })]);
    render(<MaintenanceEditMode creating onClose={() => undefined} />);
    openChannelPicker();
    fireEvent.click(await screen.findByRole("option", { name: /maint: events/ }));
    // Inline warning appears with the disabled-specific guidance.
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(screen.getByText(/Telegram integration is disabled/)).toBeTruthy();
    expect(screen.getByText(/silently dropped/)).toBeTruthy();
  });

  it("surfaces the unreadable status honestly, not as disabled/not-configured", async () => {
    channelsData.mockReturnValue([channel({ transportStatus: "unreadable" })]);
    render(<MaintenanceEditMode creating onClose={() => undefined} />);
    openChannelPicker();
    fireEvent.click(await screen.findByRole("option", { name: /maint: events/ }));
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(screen.getByText(/credentials can't be read/)).toBeTruthy();
    expect(screen.queryByText(/is disabled/)).toBeNull();
  });

  it("does not mark or warn about a healthy (ok) channel", async () => {
    channelsData.mockReturnValue([channel({ transportStatus: "ok" })]);
    render(<MaintenanceEditMode creating onClose={() => undefined} />);
    openChannelPicker();
    fireEvent.click(await screen.findByRole("option", { name: /maint: events/ }));
    // ok channels carry the transport·id description, no status badge, no warning.
    expect(screen.getByText(/telegram · -1004347420382/)).toBeTruthy();
    expect(screen.queryByText(/Integration (disabled|not configured|unreadable|unavailable)/)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
