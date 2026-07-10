// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { NotifyChannel } from "@/domain/notify-channel/notify-channel";

import { NotifyChannelsListPage } from "../notify-channels-list-page";
import { NotifyChannelDetailPage } from "../notify-channel-detail-page";

// RUK-199: transport_status highlighting on the list and detail surfaces.
// `ok` renders zero chrome; disabled / not_configured get distinct copy; an
// unknown status falls back to the generic warning (fail-visible).

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const bffFetchMock = vi.fn();
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (...args: unknown[]) => bffFetchMock(...args) };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function channel(overrides: Partial<NotifyChannel>): NotifyChannel {
  return {
    id: "c-1",
    name: "Ops alerts",
    transport: "slack",
    transportStatus: "ok",
    transportChannelId: "C0123456789",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "",
    ...overrides,
  };
}

function withClient(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe("NotifyChannelsListPage transport-status badges", () => {
  function renderList(channels: NotifyChannel[]) {
    bffFetchMock.mockImplementation(async (path: string) => {
      if (typeof path === "string" && path.includes("/api/notifications/channels")) {
        return { channels };
      }
      throw new Error(`unexpected bffFetch: ${path}`);
    });
    return withClient(<NotifyChannelsListPage />);
  }

  it("renders no status badge for an ok channel", async () => {
    renderList([channel({ transportStatus: "ok" })]);
    await waitFor(() => expect(screen.getByText("Ops alerts")).toBeTruthy());
    expect(screen.queryByText(/^Integration (disabled|not configured|unavailable)$/)).toBeNull();
  });

  it("renders distinct badges for disabled and not_configured channels", async () => {
    renderList([
      channel({ id: "c-1", name: "A", transportStatus: "disabled" }),
      channel({ id: "c-2", name: "B", transportStatus: "not_configured" }),
    ]);
    await waitFor(() => expect(screen.getByText("A")).toBeTruthy());
    expect(screen.getByText("Integration disabled")).toBeTruthy();
    expect(screen.getByText("Integration not configured")).toBeTruthy();
  });

  it("renders the generic warning badge for an unknown status (fail-visible)", async () => {
    renderList([channel({ transportStatus: "unreadable" })]);
    await waitFor(() => expect(screen.getByText("Ops alerts")).toBeTruthy());
    expect(screen.getByText("Integration unavailable")).toBeTruthy();
  });

  it("stacks the status badge with the Archived pill on archived channels", async () => {
    // Pins current behavior: archival does not suppress the delivery warning.
    // Whether it should is a design question (SPEC.md open questions).
    renderList([channel({ transportStatus: "disabled", archivedAt: "2026-03-01T00:00:00Z" })]);
    await waitFor(() => expect(screen.getByText("Ops alerts")).toBeTruthy());
    expect(screen.getByText("Archived")).toBeTruthy();
    expect(screen.getByText("Integration disabled")).toBeTruthy();
  });
});

describe("NotifyChannelDetailPage transport-status alert", () => {
  function renderDetail(overrides: Partial<NotifyChannel>) {
    const c = channel(overrides);
    bffFetchMock.mockImplementation(async (path: string) => {
      if (typeof path === "string" && path.includes(`/api/notifications/channels/${c.id}`)) {
        return c;
      }
      throw new Error(`unexpected bffFetch: ${path}`);
    });
    return withClient(<NotifyChannelDetailPage id={c.id} />);
  }

  it("shows no callout for an ok channel", async () => {
    renderDetail({ transportStatus: "ok" });
    await waitFor(() => expect(screen.getByRole("heading", { name: "Ops alerts" })).toBeTruthy());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the disabled callout with enable guidance, using the display title", async () => {
    renderDetail({ transportStatus: "disabled" });
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(screen.getByText("Integration disabled")).toBeTruthy();
    // Descriptor title ("Slack"), not the raw wire id ("slack").
    expect(screen.getByText(/The Slack integration is disabled/)).toBeTruthy();
    expect(screen.getByText(/silently dropped/)).toBeTruthy();
    expect(screen.getByText(/Enable the integration/)).toBeTruthy();
  });

  it("shows the not_configured callout with configure guidance", async () => {
    renderDetail({ transportStatus: "not_configured" });
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(screen.getByText("Integration not configured")).toBeTruthy();
    expect(screen.getByText(/Configure the integration/)).toBeTruthy();
  });

  it("shows the generic callout for an unknown status, quoting the raw value", async () => {
    renderDetail({ transportStatus: "unreadable" });
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(screen.getByText("Integration unavailable")).toBeTruthy();
    expect(screen.getByText(/status: unreadable/)).toBeTruthy();
  });

  it("falls back to the raw id in copy for an unmodeled transport", async () => {
    renderDetail({ transport: "pagerduty", transportStatus: "disabled" });
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(screen.getByText(/The pagerduty integration is disabled/)).toBeTruthy();
  });
});
