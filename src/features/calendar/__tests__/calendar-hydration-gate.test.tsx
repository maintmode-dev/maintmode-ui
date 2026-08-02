// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { DEFAULT_STATUSES, FILTERS_STORAGE_KEY } from "../calendar-filters";
import { useCalendarQuery as mockedUseCalendarQuery } from "../queries/use-calendar-query";

/**
 * A cold calendar load used to fire TWO requests: a Day window with the default
 * statuses (discarded), then the stored month window (rendered). The page can't
 * read localStorage during render without diverging from SSR, so it starts on
 * defaults and adopts the stored view in a mount effect — which is a second
 * query key, hence a second request.
 *
 * These tests pin the fix: the query is gated on `hydrated`, so exactly one
 * request goes out and it is the one whose response is actually used.
 *
 * Requests are counted at `globalThis.fetch`, NOT by mocking `bffFetch` or the
 * hook: the defect is the number of requests that reach the network, and a mock
 * one layer up would prove only that a function was called.
 */

// jsdom lacks the layout APIs the sidebar/portal children rely on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

// jsdom in this config doesn't provide a working store; the page reads its view
// and filters from it on mount, so back it with an in-memory stub we control.
const storageStore = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => storageStore.get(k) ?? null,
    setItem: (k: string, v: string) => void storageStore.set(k, String(v)),
    removeItem: (k: string) => void storageStore.delete(k),
    clear: () => storageStore.clear(),
  },
});

// Keep the page test focused on the request count: resolve the role gate and
// the display zone synchronously so neither needs a network round-trip.
vi.mock("@/features/_shared/queries/use-me-query", () => ({
  useMeQuery: () => ({ data: undefined }),
}));
vi.mock("@/features/_shared/timezone/use-timezone", () => ({
  useTimezone: () => ({ zone: "UTC", ready: true }),
}));

// When set, forces the page's `enabled` to this value. Lets a test hold the gate
// shut for the whole render — the gated commit is otherwise unobservable,
// because RTL's `render` wraps in `act()`, which flushes the mount effect.
// The real hook still runs: only the `enabled` argument is overridden, so the
// query's flags, the fetch, and the page's `status` derivation are all genuine.
let gateOverride: boolean | undefined;
vi.mock("../queries/use-calendar-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../queries/use-calendar-query")>();
  return {
    ...actual,
    useCalendarQuery: (
      params: Parameters<typeof actual.useCalendarQuery>[0],
      options: Parameters<typeof actual.useCalendarQuery>[1] = {},
    ) =>
      actual.useCalendarQuery(
        params,
        gateOverride === undefined ? options : { ...options, enabled: gateOverride },
      ),
  };
});

import { CalendarPage } from "../calendar-page";

const VIEW_STORAGE_KEY = "maintmode.calendar.view";

/** Every `/api/calendar` URL requested since the last reset, in order. */
let calls: string[] = [];

beforeEach(() => {
  calls = [];
  storageStore.clear();
  gateOverride = undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/calendar")) calls.push(url);
      // Empty window → the page renders its empty state, so no FullCalendar
      // grid mounts and the test stays about the request count.
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Query params of the Nth recorded `/api/calendar` call. */
function paramsOf(index: number): URLSearchParams {
  return new URL(calls[index], "http://localhost").searchParams;
}

/**
 * Let any pending fetch actually go out. Needed because "no request was made"
 * and "no SECOND request was made" are claims about absence — asserting them
 * immediately would pass even on code that fetches a tick later.
 */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

describe("useCalendarQuery — the `enabled` gate", () => {
  const params = { from: "2026-08-01", to: "2026-08-31", statuses: ["planned"] };

  it("fires no request while disabled", async () => {
    const { result } = renderHook(() => mockedUseCalendarQuery(params, { enabled: false }), { wrapper });

    await settle();
    expect(calls).toHaveLength(0);
    // A disabled query never resolves — the caller keeps seeing its loading
    // state. This is why the gate is only safe on a flag guaranteed to flip.
    expect(result.current.isPending).toBe(true);
  });

  it("fires exactly one request when enabled", async () => {
    renderHook(() => mockedUseCalendarQuery(params, { enabled: true }), { wrapper });

    await waitFor(() => expect(calls).toHaveLength(1));
  });

  it("fires exactly one request when it flips from disabled to enabled", async () => {
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => mockedUseCalendarQuery(params, { enabled }),
      { wrapper, initialProps: { enabled: false } },
    );

    await settle();
    expect(calls).toHaveLength(0);

    rerender({ enabled: true });
    await waitFor(() => expect(calls).toHaveLength(1));
    // Still one after settling — the flip must not queue a second fetch.
    await settle();
    expect(calls).toHaveLength(1);
  });

  it("defaults to enabled when no options are passed", async () => {
    // The resource/channel detail pages call the hook with one argument; the
    // gate must not silently disable them.
    renderHook(() => mockedUseCalendarQuery(params), { wrapper });

    await waitFor(() => expect(calls).toHaveLength(1));
  });
});

describe("CalendarPage — one request per cold load", () => {
  it("sends a single request for the STORED month window, not the Day default", async () => {
    // Asymmetric fixture, on purpose: the stored view and statuses must both
    // differ from the defaults. With `view: "day"` and the default statuses the
    // two requests would coincide and this test would pass on the broken code.
    storageStore.set(VIEW_STORAGE_KEY, "month");
    storageStore.set(
      FILTERS_STORAGE_KEY,
      JSON.stringify({ statuses: ["completed", "canceled"], scope: "all" }),
    );

    render(<CalendarPage />, { wrapper });

    await waitFor(() => expect(calls).toHaveLength(1));

    const q = paramsOf(0);
    // A month window spans well beyond a single day; the discarded request had
    // from === to. Asserting the span (not exact dates) keeps this independent
    // of the clock.
    expect(q.get("from")).not.toBe(q.get("to"));
    expect(q.getAll("statuses").sort()).toEqual(["canceled", "completed"]);

    // No late second request from the hydration effect.
    await settle();
    expect(calls).toHaveLength(1);
  });

  it("renders the loading skeleton — not the empty state — while the gate is shut", async () => {
    // The gate makes the query disabled for one commit, and a disabled TanStack
    // v5 query reports `isPending: true` but `isFetching: false`. The page must
    // derive its loading state from `isPending`: with `isFetching` it would fall
    // through to "ready" during that commit and flash "No maintenance is
    // scheduled" before a request had even been made. That flash is the one new
    // risk this fix introduces, so it gets a test.
    //
    // The gated commit is NOT observable through `CalendarPage` — RTL's `render`
    // wraps in `act()`, which flushes the mount effect, so `hydrated` is already
    // true by the time control returns. Holding the gate shut permanently is the
    // only way to inspect that state, so this drives the real page component
    // with a query that never enables.
    // Hold the gate shut for the whole render by forcing every `useCalendarQuery`
    // call in the page to be disabled. The page's own `status` derivation then
    // runs against the real flags of a disabled query.
    gateOverride = false;

    render(<CalendarPage />, { wrapper });
    await settle();

    // Zero requests — the gate never opened.
    expect(calls).toHaveLength(0);
    // The skeleton is up (CalendarLoading marks itself `aria-busy`), and the
    // empty state is NOT, even though no request has been made.
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(document.body.textContent).not.toMatch(/No maintenance is scheduled/i);
  });

  it("sends a single request with the defaults when nothing is stored", async () => {
    render(<CalendarPage />, { wrapper });

    await waitFor(() => expect(calls).toHaveLength(1));

    const q = paramsOf(0);
    // Default view is Day — a single-day window.
    expect(q.get("from")).toBe(q.get("to"));
    expect(q.getAll("statuses").sort()).toEqual([...DEFAULT_STATUSES].sort());

    await settle();
    expect(calls).toHaveLength(1);
  });
});
