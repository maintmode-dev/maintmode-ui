// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { NotifyChannel } from "@/domain/notify-channel/notify-channel";

import { NotifyChannelsListPage } from "../notify-channels-list-page";
import { NotifyChannelDetailPage } from "../notify-channel-detail-page";

// RUK-199 / RUK-200: transport_status highlighting on the list and detail
// surfaces. `ok` renders zero chrome; disabled / not_configured / unreadable get
// distinct dedicated copy; a genuinely unknown future status falls back to the
// generic warning (fail-visible).

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

/**
 * Mounts the page over the REAL hook, so this helper answers with the wire
 * shape the BFF sends — the pagination window, not a bare array (RUK-274).
 *
 * `total` defaults to the row count, which is the "nothing is truncated" case
 * every status-badge assertion wants. Pass a larger one to put the page in the
 * truncated state.
 */
function renderList(channels: NotifyChannel[], total = channels.length) {
  bffFetchMock.mockImplementation(async (path: string) => {
    if (typeof path === "string" && path.includes("/api/notifications/channels")) {
      return { channels, limit: channels.length, offset: 0, total };
    }
    throw new Error(`unexpected bffFetch: ${path}`);
  });
  return withClient(<NotifyChannelsListPage />);
}

/** Re-point the mock at a zero-row answer without remounting the page. */
function renderListEmpty() {
  bffFetchMock.mockImplementation(async (path: string) => {
    if (typeof path === "string" && path.includes("/api/notifications/channels")) {
      return { channels: [], limit: 50, offset: 0, total: 0 };
    }
    throw new Error(`unexpected bffFetch: ${path}`);
  });
}

describe("NotifyChannelsListPage transport-status badges", () => {
  it("renders no status badge for an ok channel", async () => {
    renderList([channel({ transportStatus: "ok" })]);
    await waitFor(() => expect(screen.getByText("Ops alerts")).toBeTruthy());
    expect(screen.queryByText(/^Integration (disabled|not configured|unreadable|unavailable)$/)).toBeNull();
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

  it("renders the dedicated badge for an unreadable channel (RUK-200)", async () => {
    renderList([channel({ transportStatus: "unreadable" })]);
    await waitFor(() => expect(screen.getByText("Ops alerts")).toBeTruthy());
    expect(screen.getByText("Integration unreadable")).toBeTruthy();
    // Never mislabelled as the wrong (toggle-based) fix.
    expect(screen.queryByText(/^Integration (disabled|not configured|unavailable)$/)).toBeNull();
  });

  it("renders the generic warning badge for a genuinely unknown status (fail-visible)", async () => {
    renderList([channel({ transportStatus: "quux" })]);
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

  it("shows the dedicated unreadable callout pointing at the secret, not the toggle (RUK-200)", async () => {
    renderDetail({ transportStatus: "unreadable" });
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(screen.getByText("Integration unreadable")).toBeTruthy();
    expect(screen.getByText(/credentials can't be read/)).toBeTruthy();
    expect(screen.getByText(/Re-check the integration secret/)).toBeTruthy();
    // Must not send the admin to the wrong fix, nor leak the raw token as the explanation.
    expect(screen.queryByText(/is disabled/)).toBeNull();
    expect(screen.queryByText(/status: unreadable/)).toBeNull();
  });

  it("shows the generic callout for a genuinely unknown status, quoting the raw value", async () => {
    renderDetail({ transportStatus: "quux" });
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(screen.getByText("Integration unavailable")).toBeTruthy();
    expect(screen.getByText(/status: quux/)).toBeTruthy();
  });

  it("falls back to the raw id in copy for an unmodeled transport", async () => {
    renderDetail({ transport: "pagerduty", transportStatus: "disabled" });
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(screen.getByText(/The pagerduty integration is disabled/)).toBeTruthy();
  });
});

/**
 * RUK-274 — the catalog reads a pagination window, not the whole catalog.
 *
 * These cases mount the page over the REAL hook (only `bffFetch` is mocked), so
 * they exercise the request the screen actually builds and the copy it renders
 * from the answer. That matters here: the defect being fixed was invisible to
 * every test that stubbed the hook, because the truncation happens on the wire.
 */
describe("NotifyChannelsListPage pagination window (RUK-274)", () => {
  /** The path the page asked for, so a dropped `name` cannot pass unnoticed. */
  function requestedPaths(): string[] {
    return bffFetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((path) => path.includes("/api/notifications/channels"));
  }

  it("AC-3: forwards the typed query to the backend instead of filtering locally", async () => {
    renderList([channel({ name: "Ops alerts" })], 1338);
    await waitFor(() => expect(screen.getByText("Ops alerts")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Search channels by name"), {
      target: { value: "payments" },
    });

    // Debounced at 300ms, so this is the assertion that the query ever leaves
    // the screen at all — a client-side filter would never produce this path.
    await waitFor(() => expect(requestedPaths().some((p) => p.includes("name=payments"))).toBe(true));
  });

  it("AC-3: an empty box asks for no filter rather than an empty one", async () => {
    renderList([channel({})], 1338);
    await waitFor(() => expect(screen.getByText("Ops alerts")).toBeTruthy());

    // `name=` would be a second cache key holding the unfiltered rows.
    expect(requestedPaths().every((p) => !p.includes("name="))).toBe(true);
  });

  it("AC-6: the archived toggle reaches the wire, and combines with the search", async () => {
    // The route translates `archived` into `include_archived` and a contract
    // test pins that translation — but nothing checked that the screen ever
    // sends the parameter. Two silent ways to break it (the screen hardcoding
    // false, the hook dropping the key) both left the whole suite green.
    renderList([channel({ name: "Ops alerts" })], 1338);
    await waitFor(() => expect(screen.getByText("Ops alerts")).toBeTruthy());

    fireEvent.click(screen.getByLabelText("Show archived"));
    await waitFor(() => expect(requestedPaths().some((p) => p.includes("archived=true"))).toBe(true));

    fireEvent.change(screen.getByLabelText("Search channels by name"), {
      target: { value: "payments" },
    });

    // Both on the SAME request: widening to archived rows and narrowing by name
    // are independent, and an operator hunting an archived channel needs them
    // to compose rather than cancel each other out.
    await waitFor(() =>
      expect(requestedPaths().some((p) => p.includes("archived=true") && p.includes("name=payments"))).toBe(
        true,
      ),
    );
  });

  it("a failed load reads as a failure, not as an empty catalog", async () => {
    // The costliest shape of this defect, and the reason the contract test
    // exists one layer down: "No channels yet" is a PLAUSIBLE admin state, so an
    // operator who sees it after a 500 goes and creates channels that already
    // exist. The route keeps the error an error; this asserts the screen does too.
    bffFetchMock.mockImplementation(async () => {
      throw new Error("backend exploded");
    });
    withClient(<NotifyChannelsListPage />);

    await waitFor(() => expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy());
    expect(screen.queryByText("No channels yet")).toBeNull();
    expect(screen.queryByText("No channels match these filters")).toBeNull();
  });

  it("tells an empty search result apart from an empty catalog", async () => {
    // Same lie, different cause. With the search server-side the backend answers
    // 200 + zero rows for a query that matched nothing, and rendering "No
    // channels yet" there tells the operator the catalog is empty when it holds
    // thousands — and hides the one way out, "Clear filters".
    renderList([channel({ name: "Ops alerts" })], 1338);
    await waitFor(() => expect(screen.getByText("Ops alerts")).toBeTruthy());

    renderListEmpty();
    fireEvent.change(screen.getByLabelText("Search channels by name"), {
      target: { value: "zzz-no-such-channel" },
    });

    await waitFor(() => expect(screen.getByText("No channels match these filters")).toBeTruthy());
    expect(screen.queryByText("No channels yet")).toBeNull();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeTruthy();
  });

  it("AC-4: names the real total when the page is only part of the catalog", async () => {
    renderList([channel({ name: "Ops alerts" })], 1338);

    // The number the operator cannot otherwise know: one row is on screen, 1338
    // exist. Before this, the caption read "1 active" and stopped there.
    await waitFor(() => expect(screen.getByText(/Showing 1 of 1338/)).toBeTruthy());
  });

  it("AC-4: says nothing about truncation when the page IS the catalog", async () => {
    renderList([channel({ name: "Ops alerts" })]);
    await waitFor(() => expect(screen.getByText("Ops alerts")).toBeTruthy());

    // A permanent "Showing 1 of 1" would be noise on a small catalog.
    expect(screen.queryByText(/Showing/)).toBeNull();
  });
});
