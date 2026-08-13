// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * Warming the neighbouring window (RUK-260).
 *
 * A forward step is a guaranteed cache miss by construction: the window has
 * never been fetched, so `staleTime` — which only helps a *return* to a window
 * already seen — cannot apply. Prefetching the neighbour turns the common case
 * into a hit.
 *
 * What these tests are careful about:
 *  - the warmed entry must hold the whole `CalendarResponse` envelope, because
 *    `useCalendarQuery` reads `meta` back off the cache entry by key. An entry
 *    holding a bare array would strand `meta` (RUK-252);
 *  - the neighbour key must be built from the SAME params object as the query,
 *    only with `{from,to}` swapped. A key missing `statuses` warms an entry
 *    nobody will ever read, and asks the backend for every status while doing
 *    it;
 *  - nothing may be prefetched before the direction is known, or the cold load
 *    stops being one request.
 */

const bffFetchMock = vi.fn(async (_path: unknown, ..._rest: unknown[]) => ({}) as unknown);
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (path: unknown, ...rest: unknown[]) => bffFetchMock(path, ...rest) };
});

import { calendarKey, useCalendarQuery, type CalendarResponse } from "../use-calendar-query";
import { useCalendarNeighbourPrefetch } from "../use-calendar-prefetch";

const PARAMS = { from: "2026-08-10", to: "2026-08-10", statuses: ["planned"] };
const ANCHOR = new Date(Date.UTC(2026, 7, 10));

/** Day view: the neighbour forward is the next UTC day. */
const NEXT = { ...PARAMS, from: "2026-08-11", to: "2026-08-11" };
const PREV = { ...PARAMS, from: "2026-08-09", to: "2026-08-09" };

let client: QueryClient;

beforeEach(() => {
  bffFetchMock.mockReset();
  bffFetchMock.mockResolvedValue({
    items: [{ id: "m-1", title: "Neighbour window" }],
    meta: { count: 1000, truncated: true },
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // jsdom has no requestIdleCallback; the hook must cope (Safari doesn't either).
  vi.stubGlobal("requestIdleCallback", undefined);
  vi.stubGlobal("cancelIdleCallback", undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function mount(args: Parameters<typeof useCalendarNeighbourPrefetch>[0]) {
  function Probe() {
    useCalendarNeighbourPrefetch(args);
    return null;
  }
  return render(<Probe />, { wrapper });
}

describe("useCalendarNeighbourPrefetch", () => {
  it("warms the NEXT window with the full envelope when stepping forward", async () => {
    mount({ params: PARAMS, view: "day", anchor: ANCHOR, direction: 1, enabled: true });

    await waitFor(() => {
      expect(client.getQueryState(calendarKey(NEXT))?.data).toBeDefined();
    });

    const entry = client.getQueryState(calendarKey(NEXT))?.data as CalendarResponse;
    // Both halves, from one response: an items-only entry would strand `meta`.
    expect(entry.items).toHaveLength(1);
    expect(entry.meta).toEqual({ count: 1000, truncated: true });
  });

  it("warms the PREVIOUS window when stepping backward", async () => {
    mount({ params: PARAMS, view: "day", anchor: ANCHOR, direction: -1, enabled: true });

    await waitFor(() => {
      expect(client.getQueryState(calendarKey(PREV))?.data).toBeDefined();
    });
    // And not the other side — direction has to mean something.
    expect(client.getQueryState(calendarKey(NEXT))?.data).toBeUndefined();
  });

  it("prefetches NOTHING when the direction is unknown", async () => {
    // The cold load, `Today`, and view switches all land here. This is what
    // keeps opening the calendar at exactly one request.
    mount({ params: PARAMS, view: "day", anchor: ANCHOR, direction: null, enabled: true });

    await new Promise((r) => setTimeout(r, 30));
    expect(bffFetchMock).not.toHaveBeenCalled();
    expect(client.getQueryState(calendarKey(NEXT))?.data).toBeUndefined();
  });

  it("prefetches NOTHING while disabled", async () => {
    mount({ params: PARAMS, view: "day", anchor: ANCHOR, direction: 1, enabled: false });

    await new Promise((r) => setTimeout(r, 30));
    expect(bffFetchMock).not.toHaveBeenCalled();
  });

  it("builds the neighbour key from the SAME params, statuses included", async () => {
    const toggled = { ...PARAMS, statuses: ["canceled", "draft"] };
    mount({ params: toggled, view: "day", anchor: ANCHOR, direction: 1, enabled: true });

    await waitFor(() => {
      expect(
        client.getQueryState(calendarKey({ ...toggled, from: NEXT.from, to: NEXT.to }))?.data,
      ).toBeDefined();
    });
    // The load-bearing half: no entry under the DEFAULT status set. A prefetch
    // that dropped `statuses` would warm that one instead, and the operator's
    // step would still miss.
    expect(client.getQueryState(calendarKey(NEXT))?.data).toBeUndefined();

    // It must also have ASKED for the toggled statuses, not for everything.
    const url = String(bffFetchMock.mock.calls[0]?.[0] ?? "");
    expect(url).toContain("statuses=canceled");
    expect(url).toContain("statuses=draft");
  });

  it("makes the step into a warmed window cost no request at all", async () => {
    // The promise of the whole ticket, and the one thing neither the write nor
    // the key checks above actually prove. Warmed ONLY by the prefetch — the
    // neighbour is never the current window before the step — so a pass here
    // cannot be explained by `staleTime` sparing a return visit.
    mount({ params: PARAMS, view: "day", anchor: ANCHOR, direction: 1, enabled: true });
    await waitFor(() => expect(client.getQueryState(calendarKey(NEXT))?.data).toBeDefined());
    const afterWarm = bffFetchMock.mock.calls.length;

    // Now step into it: an observer mounts on the neighbour's key.
    const seen: { current?: { data?: unknown; isFetching?: boolean } } = {};
    function Stepped() {
      seen.current = useCalendarQuery(NEXT);
      return null;
    }
    render(<Stepped />, { wrapper });

    await waitFor(() => expect(seen.current?.data).toBeDefined());
    // No new call — the step read the warmed entry.
    expect(bffFetchMock.mock.calls.length).toBe(afterWarm);
    expect(seen.current?.isFetching).toBe(false);
  });

  it("hands the step BOTH halves of one response (RUK-252 invariant)", async () => {
    // `meta` is read off the cache entry by key while `items` come through
    // `select`. They must belong to the same response, or the truncation notice
    // describes a window whose events are not on screen.
    mount({ params: PARAMS, view: "day", anchor: ANCHOR, direction: 1, enabled: true });
    await waitFor(() => expect(client.getQueryState(calendarKey(NEXT))?.data).toBeDefined());

    const seen: { current?: { data?: unknown[]; meta?: unknown } } = {};
    function Stepped() {
      seen.current = useCalendarQuery(NEXT) as typeof seen.current;
      return null;
    }
    render(<Stepped />, { wrapper });

    await waitFor(() => expect(seen.current?.data).toBeDefined());
    // Items AND meta, together, from the prefetched envelope.
    expect(seen.current?.data).toHaveLength(1);
    expect(seen.current?.meta).toEqual({ count: 1000, truncated: true });
  });

  it("leaves `meta` unknown for a window that was never warmed", async () => {
    // The other half of the invariant: absent `meta` must read as "we don't
    // know", never as a confident "not truncated". A window with no cache entry
    // is exactly that case.
    const seen: { current?: { meta?: unknown } } = {};
    function Cold() {
      seen.current = useCalendarQuery(PREV) as typeof seen.current;
      return null;
    }
    render(<Cold />, { wrapper });

    // Before the response lands there is no entry, so nothing is claimed.
    expect(seen.current?.meta).toBeUndefined();
  });

  it("leaves a failed prefetch as an error entry, never a stuck pending one", async () => {
    bffFetchMock.mockRejectedValue(new Error("backend down"));
    mount({ params: PARAMS, view: "day", anchor: ANCHOR, direction: 1, enabled: true });

    await waitFor(() => {
      expect(client.getQueryState(calendarKey(NEXT))?.status).toBe("error");
    });
    // The visible window is a different key and is untouched by this.
    expect(client.getQueryState(calendarKey(PARAMS))).toBeUndefined();
  });
});
