// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/domain/admin/user";
import type { Role } from "@/domain/auth/permissions";
import type { NotifyChannel } from "@/domain/notify-channel/notify-channel";

/**
 * RUK-213 render-level gate: the "New channel" create CTA is shown to
 * write-capable roles and hidden from guests. Automated tripwire for
 * over-restriction (writer loses the CTA) and under-restriction (guest sees it).
 */

// jsdom lacks the layout APIs cmdk (the dialog's transport combobox) relies on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const meData = vi.fn<() => Partial<User> | undefined>(() => undefined);
vi.mock("@/features/_shared/queries/use-me-query", () => ({
  useMeQuery: () => ({ data: meData() }),
}));

// Empty catalog renders the neutral empty state without network. Partial mock:
// only the list query is stubbed; the create dialog's mutation hooks (imported
// from the same module) stay real so the page mounts.
const channelsData = vi.fn<() => NotifyChannel[]>(() => []);
vi.mock("../queries/use-notify-channels-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../queries/use-notify-channels-query")>()),
  // Pagination window, not a bare array (RUK-274). `total` tracks the row count
  // here: this suite is about the create gate, and a `Showing N of M` line would
  // be noise in it.
  useNotifyChannelsQuery: () => {
    const channels = channelsData();
    return {
      data: { channels, limit: channels.length, offset: 0, total: channels.length },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    };
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// Mounting the create dialog fires `useTransportsQuery` regardless of `open`.
// That request is the observable proof of a mount, so it is the signal the
// mount-gate assertions below read.
// Typed as (path, ...rest) so `call[0]` below is a known element rather than
// an index into an empty tuple — a bare `vi.fn(async () => …)` infers zero
// arity, which makes both the spread and the `call[0]` read fail `tsc`.
const bffFetchMock = vi.fn(async (_path: unknown, ..._rest: unknown[]) => ({ transports: [] }));
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (path: unknown, ...rest: unknown[]) => bffFetchMock(path, ...rest) };
});
const transportsRequests = () =>
  bffFetchMock.mock.calls.filter((call) => String(call[0]).includes("/api/notifications/transports"));

import { NotifyChannelsListPage } from "../notify-channels-list-page";

function renderPage(roles: Role[] | undefined) {
  meData.mockReturnValue(roles ? { roles } : undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NotifyChannelsListPage />
    </QueryClientProvider>,
  );
}

const createCtas = () => screen.queryAllByRole("button", { name: /New channel/ });

describe("NotifyChannelsListPage write gate (RUK-213)", () => {
  it("shows the create CTA to a writer (over-restriction tripwire)", () => {
    renderPage(["admin"]);
    // Empty catalog + writer surfaces BOTH the header and empty-state CTAs.
    // Assert exactly 2 so a single-gate regression (only one CTA hidden) fails.
    expect(createCtas()).toHaveLength(2);
  });

  it("hides the create CTA from a guest (under-restriction tripwire)", () => {
    renderPage(["guest"]);
    expect(createCtas()).toHaveLength(0);
  });

  it("shows no create CTA and a neutral empty-state caption for a guest", () => {
    renderPage(["guest"]);
    expect(screen.queryByRole("button", { name: /New channel/ })).toBeNull();
    expect(screen.getByText("No channels have been added yet.")).toBeTruthy();
  });

  /**
   * The dialog is `next/dynamic` + `ssr: false`, so it resolves asynchronously
   * under jsdom — these await the lazy boundary rather than reading the tree
   * synchronously.
   *
   * The mount gate is asserted through the transports fetch, not through
   * `role="dialog"`: a closed Radix dialog renders no dialog node, so a query
   * for it cannot tell "never mounted" from "mounted but closed" and passes
   * either way. `useTransportsQuery` fires on mount regardless of `open`, so
   * the request is the thing the gate actually eliminates.
   */
  it("mounts the create dialog for a writer, fetching transports", async () => {
    renderPage(["admin"]);
    await waitFor(() => expect(transportsRequests()).toHaveLength(1));
    fireEvent.click(createCtas()[0]);
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("never mounts the create dialog for a guest", async () => {
    renderPage(["guest"]);
    await waitFor(() => expect(screen.getByText("No channels have been added yet.")).toBeTruthy());
    // Give the lazy boundary the same chance to resolve it gets above.
    await Promise.resolve();
    expect(transportsRequests()).toHaveLength(0);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
