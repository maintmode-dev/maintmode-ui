// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * What a neighbour prefetch does when the session has died underneath it.
 *
 * This file drives the REAL `bffFetch` over a stubbed `fetch`, which is the
 * whole point: the sibling prefetch suite mocks `bffFetch`, so its "a failed
 * prefetch leaves an error entry" case never reaches the 401 branch, and the
 * 401 branch is the one that behaves differently from every other failure.
 *
 * On a 401 `AUTH_REQUIRED` for a FOREGROUND request, `bffFetch` redirects to
 * /login and returns a promise that never settles — deliberately, so the UI
 * cannot flash an error state while the browser is navigating away. Applied to
 * a background warm-up that is exactly wrong: the entry stays `fetching`
 * forever, and TanStack hands that same hung promise to the next real request
 * for the window rather than starting a fetch (`Query.fetch` returns the
 * in-flight retryer's promise). The operator lands on a window whose events
 * never arrive, with no spinner, because `keepPreviousData` is still showing
 * the previous window.
 */

import { calendarKey, useCalendarQuery } from "../use-calendar-query";
import { useCalendarNeighbourPrefetch } from "../use-calendar-prefetch";

const PARAMS = { from: "2026-08-10", to: "2026-08-10", statuses: ["planned"] };
const NEXT = { ...PARAMS, from: "2026-08-11", to: "2026-08-11" };
const ANCHOR = new Date(Date.UTC(2026, 7, 10));

let client: QueryClient;
let replace: ReturnType<typeof vi.fn>;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // jsdom lacks both idle APIs, so the hook takes its setTimeout fallback.
  vi.stubGlobal("requestIdleCallback", undefined);
  vi.stubGlobal("cancelIdleCallback", undefined);

  replace = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, replace, pathname: "/", search: "" },
  });

  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ code: "AUTH_REQUIRED", error: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function mountPrefetch() {
  function Probe() {
    useCalendarNeighbourPrefetch({
      params: PARAMS,
      view: "day",
      anchor: ANCHOR,
      direction: 1,
      enabled: true,
    });
    return null;
  }
  return render(<Probe />, { wrapper });
}

describe("neighbour prefetch against a dead session", () => {
  it("settles the entry instead of leaving it fetching forever", async () => {
    mountPrefetch();

    await waitFor(() => {
      expect(client.getQueryState(calendarKey(NEXT))?.fetchStatus).toBe("idle");
    });
    // `error`, not a stuck `pending` — an error entry is inert (nothing renders
    // it) and the next real request for this window starts clean.
    expect(client.getQueryState(calendarKey(NEXT))?.status).toBe("error");
  });

  it("does not redirect on the operator's behalf from a background call", async () => {
    mountPrefetch();

    await waitFor(() => {
      expect(client.getQueryState(calendarKey(NEXT))?.fetchStatus).toBe("idle");
    });
    // The redirect belongs to the request the operator is actually waiting on.
    // Firing it from a warm-up would yank the page out from under them on the
    // strength of a request they never made.
    expect(replace).not.toHaveBeenCalled();
  });

  it("lets a later step into that window issue its own request", async () => {
    // The failure this whole file exists for: before the fix, the step attached
    // to the prefetch's hung promise and stayed pending with no request of its
    // own, so the window never loaded and nothing showed it was trying.
    mountPrefetch();
    await waitFor(() => {
      expect(client.getQueryState(calendarKey(NEXT))?.fetchStatus).toBe("idle");
    });
    const callsAfterPrefetch = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    const seen: { current?: { isPending?: boolean } } = {};
    function Stepped() {
      seen.current = useCalendarQuery(NEXT);
      return null;
    }
    render(<Stepped />, { wrapper });

    // It goes to the network itself rather than inheriting the dead promise...
    await waitFor(() => {
      expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(
        callsAfterPrefetch,
      );
    });
    // ...and the foreground path still owns the redirect, so the operator is
    // sent to /login by the request they were actually waiting on.
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    expect(String(replace.mock.calls[0]?.[0])).toContain("/login");
  });
});
