// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * Wave 2 / W1: `useCalendarQuery` exposes the backend's truncation `meta`
 * WITHOUT changing what the query resolves to.
 *
 * The shape constraint is the point of these tests. Three call sites read
 * `query.data` as a bare `Maintenance[]` (`calendar-page.tsx` and the
 * resource/channel related feeds); `meta` therefore rides alongside as its own
 * field. The first test is the tripwire — if `data` is ever widened into an
 * envelope, it fails here rather than as a confusing render bug downstream.
 */

const bffFetchMock = vi.fn(async (_path: unknown, ..._rest: unknown[]) => ({}) as unknown);
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (path: unknown, ...rest: unknown[]) => bffFetchMock(path, ...rest) };
});

import { useCalendarQuery } from "../use-calendar-query";

const WINDOW = { from: "2026-06-01", to: "2026-06-30" };

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

/** Captures the hook's return across renders so assertions read the latest. */
function renderCalendarQuery() {
  const seen: { current: ReturnType<typeof useCalendarQuery> | undefined } = { current: undefined };
  function Probe() {
    seen.current = useCalendarQuery(WINDOW);
    return null;
  }
  render(<Probe />, { wrapper });
  return seen;
}

describe("useCalendarQuery exposes meta without changing `data`", () => {
  it("keeps `data` a bare array while surfacing `meta`", async () => {
    bffFetchMock.mockResolvedValue({
      items: [{ id: "m-1", title: "Core switch upgrade" }],
      meta: { count: 1000, truncated: true },
    });

    const seen = renderCalendarQuery();

    await waitFor(() => expect(seen.current?.data).toBeDefined());
    // The load-bearing assertion: an array, not `{ items, meta }`.
    expect(Array.isArray(seen.current?.data)).toBe(true);
    expect(seen.current?.data).toHaveLength(1);
    expect(seen.current?.meta).toEqual({ count: 1000, truncated: true });
  });

  it("reports `truncated: false` as false, distinct from an absent signal", async () => {
    bffFetchMock.mockResolvedValue({ items: [], meta: { count: 12, truncated: false } });

    const seen = renderCalendarQuery();

    await waitFor(() => expect(seen.current?.meta).toBeDefined());
    expect(seen.current?.meta?.truncated).toBe(false);
    expect(seen.current?.meta?.count).toBe(12);
  });

  it("leaves `meta` undefined when the BFF omits it, and still resolves items", async () => {
    // Exactly the shape the existing consumer tests mock.
    bffFetchMock.mockResolvedValue({ items: [{ id: "m-1" }] });

    const seen = renderCalendarQuery();

    await waitFor(() => expect(seen.current?.data).toBeDefined());
    expect(seen.current?.data).toHaveLength(1);
    // `undefined` means "unknown", which callers must not read as "complete".
    expect(seen.current?.meta).toBeUndefined();
  });

  it("refreshes `meta` when a new response replaces the cached one", async () => {
    bffFetchMock.mockResolvedValue({ items: [], meta: { count: 1000, truncated: true } });
    const seen = renderCalendarQuery();
    await waitFor(() => expect(seen.current?.meta?.truncated).toBe(true));

    // A refetch of the SAME window that now comes back complete must not leave
    // the stale `truncated: true` on screen — the cache read is keyed to the
    // response timestamp precisely to avoid that.
    bffFetchMock.mockResolvedValue({ items: [], meta: { count: 42, truncated: false } });
    await seen.current?.refetch();

    await waitFor(() => expect(seen.current?.meta?.truncated).toBe(false));
    expect(seen.current?.meta?.count).toBe(42);
  });
});
