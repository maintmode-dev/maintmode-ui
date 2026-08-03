// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * Two properties of the related-maintenance feed on the resource- and
 * channel-detail pages:
 *
 * 1. `useCalendarQuery` grew an optional second argument (`{ enabled }`). These
 *    screens call it with ONE argument and rely entirely on the `?? true`
 *    default — if that default ever regressed to `=== true` or similar, they
 *    would silently stop fetching and render a permanent skeleton with no error.
 *
 * 2. The related feed must NOT be serialized behind the page's own detail
 *    query. Both pages early-return a skeleton while their detail query is
 *    pending; the related section renders below that return (and behind
 *    `mode === "view"`). While the calendar query lived inside that section,
 *    its hook did not mount until the detail fetch resolved — two independent
 *    double hops back to back. See `waterfall` below, which pins the fix.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

vi.mock("@/features/_shared/timezone/use-timezone", () => ({
  useTimezone: () => ({ zone: "UTC", ready: true }),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

/**
 * Detail + calendar both go through `bffFetch`. Spying at that seam (rather
 * than on `fetch`) gives one ordered list of every BFF request, which is what
 * the waterfall assertions read. Each detail response is deferred so the test
 * can hold it pending — the exact state in which the old code refused to start
 * the calendar request.
 */
const bffFetchMock = vi.fn(async (_path: unknown, ..._rest: unknown[]) => ({}) as unknown);
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (path: unknown, ...rest: unknown[]) => bffFetchMock(path, ...rest) };
});

import { ResourceDetailPage } from "@/features/resources/resource-detail-page";
import { NotifyChannelDetailPage } from "@/features/notify-channels/notify-channel-detail-page";
import { useRelatedMaintenanceQuery } from "@/features/calendar/queries/use-related-maintenance-query";

const paths = () => bffFetchMock.mock.calls.map((call) => String(call[0]));
const calendarPaths = () => paths().filter((p) => p.includes("/api/calendar"));

beforeEach(() => {
  bffFetchMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * Minimal harness that exercises the shared hook directly — the `enabled ??
 * true` tripwire from (1), independent of which page hosts it.
 */
function FeedProbe({ filter }: { filter: Parameters<typeof useRelatedMaintenanceQuery>[0] }) {
  useRelatedMaintenanceQuery(filter);
  return null;
}

describe("consumers that omit the `enabled` option still fetch", () => {
  it("the resource feed requests its window", async () => {
    bffFetchMock.mockResolvedValue({ items: [] });
    render(<FeedProbe filter={{ resourceId: "res-1" }} />, { wrapper });

    await waitFor(() => expect(calendarPaths()).toHaveLength(1));
    expect(new URL(calendarPaths()[0], "http://localhost").searchParams.getAll("resource_ids")).toEqual([
      "res-1",
    ]);
  });

  it("the channel feed requests its window", async () => {
    bffFetchMock.mockResolvedValue({ items: [] });
    render(<FeedProbe filter={{ channelId: "ch-1" }} />, { wrapper });

    await waitFor(() => expect(calendarPaths()).toHaveLength(1));
    expect(new URL(calendarPaths()[0], "http://localhost").searchParams.getAll("channel_ids")).toEqual([
      "ch-1",
    ]);
  });
});

describe("the related feed is not serialized behind the detail query", () => {
  /**
   * Hold the detail request pending forever and never resolve it. The page is
   * therefore parked on its `isPending` skeleton for the whole test — the
   * related section is never rendered at all. The calendar request must still
   * have gone out, which is only possible if its hook sits above the early
   * return. With the hook back inside the section this list stays empty and the
   * `waitFor` times out.
   */
  it("resource detail starts the calendar request while the detail request is still pending", async () => {
    bffFetchMock.mockImplementation(async (path: unknown) => {
      if (String(path).includes("/api/calendar")) return { items: [] };
      return new Promise(() => {}); // detail: pending forever
    });

    render(<ResourceDetailPage id="res-1" />, { wrapper });

    await waitFor(() => expect(calendarPaths()).toHaveLength(1));
    expect(new URL(calendarPaths()[0], "http://localhost").searchParams.getAll("resource_ids")).toEqual([
      "res-1",
    ]);
  });

  it("channel detail starts the calendar request while the detail request is still pending", async () => {
    bffFetchMock.mockImplementation(async (path: unknown) => {
      if (String(path).includes("/api/calendar")) return { items: [] };
      return new Promise(() => {});
    });

    render(<NotifyChannelDetailPage id="ch-1" />, { wrapper });

    await waitFor(() => expect(calendarPaths()).toHaveLength(1));
    expect(new URL(calendarPaths()[0], "http://localhost").searchParams.getAll("channel_ids")).toEqual([
      "ch-1",
    ]);
  });

  /**
   * The stronger claim: not merely "both eventually fire" but "both are in
   * flight before either resolves". Nothing is resolved until after the
   * synchronous mount has settled, so if the calendar request were waiting on
   * the detail response it could not appear in this list.
   */
  it("issues both requests in the same tick, before either resolves", async () => {
    const resolvers: Array<() => void> = [];
    bffFetchMock.mockImplementation(
      (path: unknown) =>
        new Promise((resolve) => {
          resolvers.push(() =>
            resolve(String(path).includes("/api/calendar") ? { items: [] } : { id: "res-1", name: "db" }),
          );
        }),
    );

    render(<ResourceDetailPage id="res-1" />, { wrapper });

    // Both requests are observable while every response is still outstanding.
    await waitFor(() => expect(paths()).toHaveLength(2));
    expect(resolvers).toHaveLength(2);
    expect(paths().filter((p) => p.includes("/api/resources"))).toHaveLength(1);
    expect(calendarPaths()).toHaveLength(1);

    // Only now let them land — proving neither was gated on the other.
    for (const resolve of resolvers) resolve();
    await waitFor(() => expect(bffFetchMock).toHaveBeenCalledTimes(2));
  });

  /**
   * The hoist must not cost a duplicate request: the page owns the hook and the
   * section consumes its result as a prop, so exactly one calendar request is
   * issued once the page renders the section for real (detail resolved,
   * `mode === "view"`). A second `useCalendarQuery` anywhere would either
   * duplicate the request or, if the key drifted, miss the cache entirely.
   */
  it("issues exactly one calendar request once the page fully renders", async () => {
    bffFetchMock.mockImplementation(async (path: unknown) => {
      if (String(path).includes("/api/calendar")) return { items: [] };
      return { id: "res-1", name: "db", status: "active", created_at: "2026-01-01T00:00:00Z" };
    });

    render(<ResourceDetailPage id="res-1" />, { wrapper });

    await waitFor(() => expect(paths().filter((p) => p.includes("/api/resources"))).toHaveLength(1));
    await waitFor(() => expect(calendarPaths()).toHaveLength(1));
    // Let any post-resolution re-render settle, then confirm nothing refetched.
    await new Promise((r) => setTimeout(r, 50));
    expect(calendarPaths()).toHaveLength(1);
  });
});
