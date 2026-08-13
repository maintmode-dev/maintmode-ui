// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * The minute tick is scoped to the sidebar (RUK-265 item 1, AC-1).
 *
 * ## Why this asserts on the PAGE and not on a grid render-counter
 *
 * The obvious test — count `CalendarGrid` renders across a tick — cannot be
 * written here, and would pass vacuously if attempted. `CalendarGrid` is behind
 * `next/dynamic` (calendar-page.tsx), whose loadable runtime vitest does not
 * provide; the same limitation is recorded in `audit/custom-range-picker-split`
 * and `maintenance/maintenance-create-view`. Measured while writing this test:
 * with the page in its `ready` branch and a NON-empty window (sidebar and "Up
 * next" both rendered, so the grid's JSX branch was genuinely selected), a
 * `vi.mock`ed grid rendered 0 times in 3 s — with and without a `next/dynamic`
 * mock. A "count unchanged" assertion over 0 proves nothing.
 *
 * So this asserts the CAUSE instead, which is both stronger and observable: the
 * page must have no state, effect, or prop that a timer can change. If the page
 * does not re-render, nothing it renders can be re-rendered by the tick —
 * including the grid, whatever the loader does.
 *
 * The sidebar's own advance is asserted in the same test, so a page that stops
 * re-rendering because the CLOCK DIED cannot pass.
 */

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

vi.mock("@/features/_shared/queries/use-me-query", () => ({
  useMeQuery: () => ({ data: undefined }),
}));
vi.mock("@/features/_shared/timezone/use-timezone", () => ({
  useTimezone: () => ({ zone: "UTC", ready: true }),
}));

const bffFetchMock = vi.fn(async (_path: unknown, ..._rest: unknown[]) => ({}) as unknown);
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (path: unknown, ...rest: unknown[]) => bffFetchMock(path, ...rest) };
});

import { CalendarPage } from "../calendar-page";

/**
 * Counts renders of `CalendarSidebar` — the component that legitimately DOES
 * re-render on the tick. Having both counters lets the assertions distinguish
 * "the page did not re-render" from "the clock is dead", which look identical
 * from outside.
 *
 * Spied through `upcomingItems`, which the sidebar body calls on every render,
 * rather than by wrapping the component: a wrapper that CALLS the original runs
 * its hooks in the wrapper's own fiber, so the sidebar's tick would re-render
 * the wrapper and inflate the page counter (measured — it did, by exactly one).
 */
const sidebarRenders = { count: 0 };
vi.mock("../calendar-filters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../calendar-filters")>();
  return {
    ...actual,
    upcomingItems: (...args: Parameters<typeof actual.upcomingItems>) => {
      sidebarRenders.count += 1;
      return actual.upcomingItems(...args);
    },
  };
});

/**
 * Counts renders of the PAGE, by spying on a pure helper the page body calls on
 * every render. `periodTitle` is called unconditionally in `CalendarPage`'s JSX,
 * so its call count is the page's render count.
 *
 * A DOM-node-identity check was tried first and rejected: React reuses the host
 * node when the rendered output is unchanged, so it passes even on a page that
 * re-renders every minute (measured against a deliberately reverted build).
 */
const pageRenders = { count: 0 };
vi.mock("../view-range", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../view-range")>();
  return {
    ...actual,
    periodTitle: (...args: Parameters<typeof actual.periodTitle>) => {
      pageRenders.count += 1;
      return actual.periodTitle(...args);
    },
  };
});

/**
 * Anchored to the REAL clock and then pinned as the fake clock's start, so the
 * page's requested window contains the fixture whatever day the suite runs on.
 */
const NOW = new Date();

beforeEach(() => {
  storageStore.clear();
  bffFetchMock.mockReset();
  pageRenders.count = 0;
  sidebarRenders.count = 0;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * One event, running now, so the page lands on its populated `ready` branch and
 * the sidebar's "Up next" shows it. Built from the real clock (see `NOW`): it
 * started an hour ago and runs for another ten, which puts it inside the
 * requested window and inside `upcomingItems`' running-now branch whatever the
 * day the suite runs on.
 */
const RUNNING_NOW = {
  id: "m-1",
  title: "Core switch upgrade",
  status: "in_progress",
  resources: [],
  planned_period: {
    start: new Date(NOW.getTime() - 60 * 60_000).toISOString(),
    end: new Date(NOW.getTime() + 10 * 60 * 60_000).toISOString(),
  },
};

describe("the minute tick does not re-render the calendar page", () => {
  it("leaves the page untouched across a tick while the sidebar advances", async () => {
    bffFetchMock.mockImplementation(async (path: unknown) => {
      if (String(path).includes("/api/calendar")) return { items: [RUNNING_NOW] };
      return {};
    });

    // Fake timers are installed BEFORE mount, so the interval `useNow` registers
    // is the fake one and `advanceTimersByTime` actually fires it. Installing
    // them after mount (an earlier draft of this file) captures a real interval
    // that no amount of fake advancing can trigger — and the test then passes on
    // a build that ticks the page, which is the regression it exists to catch.
    vi.useFakeTimers();
    // Pin the fake clock to the real instant the fixture was built from, so the
    // page's requested window contains the event.
    vi.setSystemTime(NOW);
    render(<CalendarPage />, { wrapper });

    // Drive hydration, the debounced window and the query settle on fake time.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(screen.queryByLabelText("Calendar filters")).not.toBeNull();
    expect(screen.queryByText("Core switch upgrade")).not.toBeNull();

    const pageBefore = pageRenders.count;
    // Snapshot how many calendar requests have gone out: the tick must not
    // trigger a refetch either (that would re-render the page for a real reason
    // and mask the regression this guards).
    const callsBefore = bffFetchMock.mock.calls.length;

    // Baseline: advance half a tick. Nothing clock-driven fires, so whatever
    // renders happen here are the page's ambient background (query bookkeeping),
    // not the tick.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    const pageAmbient = pageRenders.count - pageBefore;
    const sidebarAtHalf = sidebarRenders.count;

    // Now cross the minute boundary: the sidebar's clock fires here and only
    // here.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    // Both halves, asserted at the same instant — either alone would pass on a
    // build that is broken in the other direction:
    //   crossing the minute boundary cost the page nothing BEYOND the ambient
    //   background measured over the identical half-tick before it. Asserted as
    //   an upper bound, not an equality: the regression this guards only ever
    //   ADDS renders, while a future one-shot timer landing between 30 s and
    //   60 s (a toast auto-dismiss, a gc sweep) would break an equality with a
    //   misleading message while the property still held...
    expect(pageRenders.count - pageBefore).toBeLessThanOrEqual(pageAmbient);
    //   ...while the sidebar re-rendered exactly there, so the clock is alive
    //   rather than deleted.
    expect(sidebarRenders.count).toBeGreaterThan(sidebarAtHalf);
    // And nothing refetched.
    expect(bffFetchMock.mock.calls.length).toBe(callsBefore);
  });

  it("still runs a live minute interval, mounted by the sidebar rather than the page", async () => {
    // The other half of AC-1. A page that stopped re-rendering because the clock
    // was DELETED rather than relocated would satisfy the assertion above, so
    // this pins that a 60 s interval is still live once the tree has mounted.
    //
    // Asserted on the interval itself, not on rendered output: `useNow`'s
    // interval is registered under real timers during mount, so a later
    // `useFakeTimers()` cannot drive it — the value-level proof lives in
    // `calendar-sidebar.test.tsx`, which fakes the clock BEFORE mounting.
    bffFetchMock.mockImplementation(async (path: unknown) => {
      if (String(path).includes("/api/calendar")) return { items: [RUNNING_NOW] };
      return {};
    });

    const setInterval = vi.spyOn(globalThis, "setInterval");
    render(<CalendarPage />, { wrapper });
    // `findAllBy`, not `queryBy`: this file renders the same fixture twice, and a
    // node left behind by an earlier test would make a single-match query throw
    // "found multiple elements" rather than fail on the thing under test.
    await waitFor(() => expect(screen.getAllByText("Core switch upgrade").length).toBeGreaterThan(0));

    const minuteIntervals = setInterval.mock.calls.filter(([, ms]) => ms === 60_000);
    expect(minuteIntervals.length).toBe(1);
    setInterval.mockRestore();
  });
});
