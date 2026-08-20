// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * The truncation notice never carries a count across a window change
 * (RUK-265 AC-5/AC-5b, guarding RUK-252).
 *
 * Deriving `meta` from the query's own data (rather than an out-of-band cache
 * read) creates a hazard the previous implementation did not have: with
 * `keepPreviousData`, a step to a new window keeps the PREVIOUS window's `items`
 * on screen — and `meta` would ride along with them. The notice renders its
 * quantity verbatim ("Showing the first N maintenances"), so that would put a
 * confidently wrong number under the new date header.
 *
 * `calendar-truncation-notice.tsx` states the rule directly: the count comes
 * from the response, never a constant, because "a confidently wrong count is
 * worse than the silent truncation this closes". These tests pin that the fix
 * did not reintroduce it by another route — in both directions:
 *
 *   - a truncated window → a step: the notice must go away, not follow;
 *   - the same, for a FILTER change, which also changes the query key.
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

/** Resolvers for in-flight calendar calls, so a window can be held pending. */
let pending: ((value: unknown) => void)[] = [];
const bffFetchMock = vi.fn(async (_path: unknown, ..._rest: unknown[]) => ({}) as unknown);
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (path: unknown, ...rest: unknown[]) => bffFetchMock(path, ...rest) };
});

import { CalendarPage } from "../calendar-page";

const NOW = new Date();

/** A truncated window: one visible event, and a `meta` saying 1000 were capped. */
const TRUNCATED = {
  items: [
    {
      id: "m-1",
      title: "Core switch upgrade",
      status: "in_progress",
      resources: [],
      planned_period: {
        start: new Date(NOW.getTime() - 60 * 60_000).toISOString(),
        end: new Date(NOW.getTime() + 10 * 60 * 60_000).toISOString(),
      },
    },
  ],
  meta: { count: 1000, truncated: true },
};

beforeEach(() => {
  storageStore.clear();
  bffFetchMock.mockReset();
  pending = [];
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const notice = () => screen.queryByTestId("calendar-truncation-notice");

/**
 * First calendar call resolves truncated; every later one is held pending, so
 * the assertion runs while the new window is genuinely in flight.
 */
function serveTruncatedThenHang() {
  let served = 0;
  bffFetchMock.mockImplementation(async (path: unknown) => {
    if (!String(path).includes("/api/calendar")) return {};
    served += 1;
    if (served === 1) return TRUNCATED;
    return new Promise((resolve) => pending.push(resolve));
  });
}

describe("truncation notice across a window change", () => {
  it("drops the notice while a new window is in flight, rather than carrying its count", async () => {
    serveTruncatedThenHang();
    render(<CalendarPage />, { wrapper });

    // The truncated window has landed and the notice is up, with its count.
    await waitFor(() => expect(notice()).not.toBeNull());
    expect(notice()?.textContent).toContain("1000");

    // Step forward. `keepPreviousData` holds the previous events on screen, so
    // the grid still shows the old window — the notice must NOT do the same.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      // NOT load-bearing, and deliberately kept anyway. Measured: with this at
      // 0 ms, or removed entirely, both tests still pass — the notice clears the
      // moment the query KEY changes, which is immediate, well before the 250 ms
      // step debounce flushes the request. So this does not reach the debounced
      // in-flight window; it only lets the request actually go out, which makes
      // the scenario the realistic one rather than a key-change-only artifact.
      await new Promise((r) => setTimeout(r, 400));
    });

    // Both halves. The negative alone would also pass if the page had fallen
    // into its error or loading branch, which unmounts the notice for an
    // unrelated reason — so assert the stale events are STILL on screen, which
    // is the whole premise of the hazard: previous items, no previous count.
    await waitFor(() => expect(notice()).toBeNull());
    expect(screen.getAllByText("Core switch upgrade").length).toBeGreaterThan(0);
  });

  it("drops the notice on a FILTER change too, which also changes the key", async () => {
    // AC-5b. The status chips are part of the query key, so toggling one is a
    // window change by another name — and would otherwise show the previous
    // status set's count under the new chips.
    serveTruncatedThenHang();
    render(<CalendarPage />, { wrapper });

    await waitFor(() => expect(notice()).not.toBeNull());
    expect(notice()?.textContent).toContain("1000");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Draft" }));
      // See the note on the previous test: not load-bearing, kept for realism.
      await new Promise((r) => setTimeout(r, 400));
    });

    await waitFor(() => expect(notice()).toBeNull());
    expect(screen.getAllByText("Core switch upgrade").length).toBeGreaterThan(0);
  });
});
