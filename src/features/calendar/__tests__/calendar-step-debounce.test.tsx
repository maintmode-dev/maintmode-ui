// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * Stepping the calendar, at the page level (RUK-260).
 *
 * The hook tests next door prove the debounce and the prefetch in isolation.
 * These prove the two things only the assembled page can show:
 *
 *  1. the header moves on the click while the request does NOT — the request is
 *     debounced, the UI never is. Asserted at the same instant, because either
 *     half alone passes on a build that has no debounce at all;
 *  2. opening the calendar without stepping still costs exactly one request —
 *     the prefetch stays out of the cold path because no direction is known yet.
 */

// jsdom in this config has no working store, and the page reads its view and
// filters from it on mount. Defined on `window` rather than via `stubGlobal`
// because `unstubAllGlobals` in afterEach would take it away from the next test.
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

import { CalendarPage } from "../calendar-page";
import { STEP_DEBOUNCE_MS } from "../queries/use-calendar-window";

let calls: string[] = [];

beforeEach(() => {
  calls = [];
  storageStore.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/calendar")) calls.push(url);
      // Empty windows keep FullCalendar out of the test: the page renders its
      // empty state instead, so this stays about request counts.
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

const calendarCalls = () => calls.length;
const windowOf = (i: number) => {
  const q = new URL(calls[i], "http://localhost").searchParams;
  return { from: q.get("from"), to: q.get("to") };
};

describe("CalendarPage — stepping", () => {
  it("moves the header on the click while the request waits", async () => {
    render(<CalendarPage />, { wrapper });
    await waitFor(() => expect(calendarCalls()).toBe(1));

    const before = screen.getByRole("heading", { level: 1 }).textContent;
    const callsBefore = calendarCalls();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    });

    // Both halves, at the same instant. The title has moved forward by exactly
    // one day — "changed" is too weak, it would also accept a jump of two or a
    // step the wrong way...
    const dayIn = (t: string | null) => Number(t?.match(/\b(\d{1,2}),/)?.[1]);
    expect(dayIn(screen.getByRole("heading", { level: 1 }).textContent)).toBe(dayIn(before) + 1);
    // ...and no request has gone out for it yet.
    expect(calendarCalls()).toBe(callsBefore);
  });

  it("collapses a burst of steps into a single request for the LAST window", async () => {
    render(<CalendarPage />, { wrapper });
    await waitFor(() => expect(calendarCalls()).toBe(1));
    const firstWindow = windowOf(0);

    const next = screen.getByRole("button", { name: "Next" });
    // Separate commits AND real elapsed time between clicks — both are needed,
    // and each was learned from a mutation that survived without it.
    //
    // Four clicks in one `act` are batched into a single commit, so the
    // intermediate windows never render and React collapses the burst. Fixing
    // only that is still not enough: with no time passing between commits, even
    // a zero-delay timer cannot fire, so the scheduler goes on doing the
    // collapsing and the test stays green with the debounce set to 0. Clicking
    // in separate commits, spaced under the threshold, is the only shape that
    // makes this test about the debounce at all.
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        fireEvent.click(next);
        await new Promise((r) => setTimeout(r, STEP_DEBOUNCE_MS - 150));
      });
    }

    const title = () => screen.getByRole("heading", { level: 1 }).textContent ?? "";
    const dayOf = (iso: string | null) => String(Number(iso?.slice(8, 10)));
    const landedOn = String(Number(title().match(/\b(\d{1,2}),/)?.[1]));

    await waitFor(() => {
      const fetched = calls.map((c) => new URL(c, "http://x").searchParams.get("from"));
      expect(fetched.some((f) => dayOf(f) === landedOn)).toBe(true);
    });

    // Independent expectation, computed from where the burst started and how
    // many times it stepped — NOT read back out of the requests the run happened
    // to make. Four clicks from the start day land four days on, and its warmed
    // neighbour is the day after that.
    const startDay = Number(firstWindow.from?.slice(8, 10));
    expect(landedOn).toBe(String(startDay + 4));

    // And the exact tally: the window opened on, the window landed on, and one
    // neighbour warmed ahead. Three — not seven, which is what one request per
    // click plus its prefetches would cost. Anything scheduled for a window
    // walked past would have to show up here, so this also pins that the idle
    // callback is cancelled when the window moves on.
    await new Promise((r) => setTimeout(r, 150));
    const fetched = calls.map((c) => new URL(c, "http://x").searchParams.get("from"));
    expect(fetched.map(dayOf)).toEqual([String(startDay), String(startDay + 4), String(startDay + 5)]);
  });

  it("warms the window AFTER the one stepped into, and only after fetching it", async () => {
    // Regression, and the reason the burst test above is not enough on its own.
    // The prefetch steps from an anchor; the request uses the debounced window.
    // While those two disagree — which is the whole quiet period — the neighbour
    // came out one step too far: from Aug 12, a click to Aug 13 warmed Aug 14
    // and left Aug 13 cold. It also went out FIRST, because the debounce means
    // no request is in flight to hold it back, so the prefetch overtook the very
    // request it exists to make unnecessary.
    render(<CalendarPage />, { wrapper });
    await waitFor(() => expect(calendarCalls()).toBe(1));
    const startDay = Number(windowOf(0).from?.slice(8, 10));

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    });

    await waitFor(() => expect(calendarCalls()).toBe(2));
    // The stepped-into window is fetched BEFORE anything is warmed ahead.
    expect(Number(windowOf(1).from?.slice(8, 10))).toBe(startDay + 1);

    await waitFor(() => expect(calendarCalls()).toBe(3));
    // ...and the warmed one is its neighbour, not the window beyond it.
    expect(Number(windowOf(2).from?.slice(8, 10))).toBe(startDay + 2);
  });

  it("costs exactly one request when the calendar is opened but never stepped", async () => {
    render(<CalendarPage />, { wrapper });
    await waitFor(() => expect(calendarCalls()).toBe(1));

    // Long enough for an idle prefetch to have fired if one were scheduled.
    await new Promise((r) => setTimeout(r, 120));
    // Still one: with no direction known, there is no neighbour worth warming,
    // and an operator who only reads today's calendar pays nothing extra.
    expect(calendarCalls()).toBe(1);
  });
});
