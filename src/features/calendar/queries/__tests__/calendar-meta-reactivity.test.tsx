// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `meta` comes from the same response as `items` (RUK-265 item 3, AC-3/AC-5).
 *
 * ## The bug this pins, and why the obvious argument that it cannot happen fails
 *
 * `meta` used to be read with `client.getQueryData(...)` during render — a plain
 * read, not a subscription. The natural objection is that it cannot go stale,
 * because any settle on the observed key re-renders the hook and re-runs the
 * read. That objection stops one gate too early.
 *
 * `QueryObserver.updateResult` first bails on
 * `shallowEqualObjects(nextResult, prevResult)` — which `dataUpdatedAt` alone
 * would defeat — but then gates the notification a SECOND time through
 * `shouldNotifyListeners`, which under React's tracked-props proxy notifies only
 * when a field the component actually READ has changed. A consumer reading only
 * `data` never tracks `dataUpdatedAt`. So when a response arrives whose `items`
 * are structurally identical, structural sharing preserves the array reference,
 * `data` is unchanged, no tracked prop changed, and React does not re-render —
 * leaving the out-of-band `meta` read showing the PREVIOUS response's value.
 *
 * Measured against the pre-fix implementation: the component displayed
 * `{count: 1, truncated: false}` while the cache held
 * `{count: 1000, truncated: true}` — "window complete" over a truncated window,
 * which is exactly the silent hiding RUK-252 exists to close.
 *
 * The fix makes `meta` and `items` fall out of ONE `select` on one response, so
 * the pairing is structural rather than topological.
 */

const bffFetchMock = vi.fn(async (_path: unknown, ..._rest: unknown[]) => ({}) as unknown);
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (path: unknown, ...rest: unknown[]) => bffFetchMock(path, ...rest) };
});

import { calendarKey, useCalendarQuery, type CalendarResponse } from "../use-calendar-query";

const WINDOW = { from: "2026-06-01", to: "2026-06-30" };

beforeEach(() => {
  bffFetchMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * Renders the hook and captures its result, plus the QueryClient, so a test can
 * write to the cache from OUTSIDE the component — the path the neighbour
 * prefetch already takes in production (`use-calendar-prefetch.ts` writes the
 * cache from an effect).
 */
function renderCalendarQuery() {
  const seen: {
    current?: ReturnType<typeof useCalendarQuery>;
    client?: ReturnType<typeof useQueryClient>;
    refetch?: ReturnType<typeof useCalendarQuery>["refetch"];
    renders: number;
  } = { renders: 0 };

  function Probe() {
    seen.renders += 1;
    seen.client = useQueryClient();
    const q = useCalendarQuery(WINDOW);
    // Snapshot ONLY the two fields the call sites read. Spreading or storing the
    // whole result would touch every getter on the tracked-props proxy and
    // subscribe the component to fields (isFetching, dataUpdatedAt) that the real
    // consumers never read — which is precisely what hides the bug.
    seen.current = { data: q.data, meta: q.meta } as ReturnType<typeof useCalendarQuery>;
    // Kept OUT of `seen.current` on purpose: reading `refetch` off the proxy is
    // harmless (it is not a state field), but storing the whole result would
    // touch every getter and subscribe the probe to fields the real call sites
    // never read — which is exactly what hides the bug under test.
    seen.refetch = q.refetch;
    return null;
  }

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
  return seen;
}

describe("meta is derived from the same response as items", () => {
  it("tracks a meta change carried by a response whose items are structurally identical", async () => {
    bffFetchMock.mockResolvedValue({
      items: [{ id: "m-1", title: "Core switch upgrade" }],
      meta: { count: 1, truncated: false },
    });

    const seen = renderCalendarQuery();
    await waitFor(() => expect(seen.current?.meta).toBeDefined());
    expect(seen.current?.meta?.truncated).toBe(false);

    // The same window, refetched, now reports itself truncated. `items` are
    // structurally identical, so structural sharing preserves the reference and
    // the plain-read implementation never re-runs.
    seen.client?.setQueryData<CalendarResponse>(calendarKey(WINDOW), {
      items: [{ id: "m-1", title: "Core switch upgrade" }] as CalendarResponse["items"],
      meta: { count: 1000, truncated: true },
    });

    await waitFor(() => expect(seen.current?.meta?.truncated).toBe(true));
    expect(seen.current?.meta?.count).toBe(1000);
  });

  it("keeps `meta` visible across a refetch of the SAME window", async () => {
    // The direction the `isPlaceholderData` guard must NOT suppress. During a
    // background refetch of the window already on screen, the previous data
    // belongs to the CURRENT key — so the count still describes exactly what the
    // operator is looking at, and hiding it would flicker the notice off and on.
    //
    // This is the case a well-meaning "hardening" of the guard to
    // `query.isFetching` or `!query.isSuccess` would silently break, since those
    // are true during a same-key refetch too.
    bffFetchMock.mockResolvedValue({ items: [], meta: { count: 1000, truncated: true } });
    const seen = renderCalendarQuery();
    await waitFor(() => expect(seen.current?.meta?.truncated).toBe(true));

    let release: (() => void) | undefined;
    bffFetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ items: [], meta: { count: 42, truncated: false } });
        }),
    );
    void seen.refetch?.();

    // In flight, same key: the previous count still describes this window.
    await waitFor(() => expect(release).toBeDefined());
    expect(seen.current?.meta).toEqual({ count: 1000, truncated: true });

    release?.();
    await waitFor(() => expect(seen.current?.meta?.truncated).toBe(false));
    expect(seen.current?.meta?.count).toBe(42);
  });

  it("keeps `data` a bare array — the shape all three call sites read", async () => {
    // The tripwire. `data` is read as `CalendarEvent[]` by the calendar page and
    // by both detail-page related feeds; widening it into an envelope would
    // break them, so the envelope must stay inside the hook.
    bffFetchMock.mockResolvedValue({
      items: [{ id: "m-1" }],
      meta: { count: 1, truncated: false },
    });

    const seen = renderCalendarQuery();
    await waitFor(() => expect(seen.current?.data).toBeDefined());

    expect(Array.isArray(seen.current?.data)).toBe(true);
    expect(seen.current?.data).toHaveLength(1);
  });

  it("preserves the items ARRAY IDENTITY across a meta-only change", async () => {
    // AC-10. `items` feeds `filteredItems` → `events` → FullCalendar; if a
    // meta-only response handed back a new array, every event would be rebuilt
    // for a change that touched no event. Structural sharing is what prevents
    // that, and this pins it rather than trusting the library.
    bffFetchMock.mockResolvedValue({
      items: [{ id: "m-1", title: "Core switch upgrade" }],
      meta: { count: 1, truncated: false },
    });

    const seen = renderCalendarQuery();
    await waitFor(() => expect(seen.current?.data).toBeDefined());
    const itemsBefore = seen.current?.data;

    seen.client?.setQueryData<CalendarResponse>(calendarKey(WINDOW), {
      items: [{ id: "m-1", title: "Core switch upgrade" }] as CalendarResponse["items"],
      meta: { count: 1000, truncated: true },
    });
    await waitFor(() => expect(seen.current?.meta?.truncated).toBe(true));

    expect(seen.current?.data).toBe(itemsBefore);
  });

  it("exposes `meta` immediately when the window was PREFETCH-warmed", async () => {
    // The common case for a forward step, and the one path where `meta` appears
    // with no suppression gap: a warmed entry is real data under the new key, so
    // `isPlaceholderData` is false from the first commit. The mid-flight tests
    // only cover the COLD path, where the guard does fire.
    //
    // This pins that the guard is not over-broad — suppressing here would blank
    // the notice on exactly the steps the prefetch exists to make instant.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData<CalendarResponse>(calendarKey(WINDOW), {
      items: [{ id: "m-1" }] as CalendarResponse["items"],
      meta: { count: 1000, truncated: true },
    });

    const seen: { meta?: unknown; placeholder?: boolean } = {};
    function Probe() {
      const q = useCalendarQuery(WINDOW);
      seen.meta = q.meta;
      seen.placeholder = q.isPlaceholderData;
      return null;
    }
    render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );

    expect(seen.placeholder).toBe(false);
    expect(seen.meta).toEqual({ count: 1000, truncated: true });
  });

  it("exposes `meta` from a warm entry even while the query is DISABLED", async () => {
    // `calendar-page.tsx` gates on `{ enabled: hydrated }`, so this is the real
    // pre-hydration state on every load that already has the window cached.
    // A disabled query must still surface the truncation signal it has, and must
    // not fetch to do so.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData<CalendarResponse>(calendarKey(WINDOW), {
      items: [] as CalendarResponse["items"],
      meta: { count: 1000, truncated: true },
    });

    const seen: { meta?: unknown } = {};
    function Probe() {
      seen.meta = useCalendarQuery(WINDOW, { enabled: false }).meta;
      return null;
    }
    render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );

    expect(seen.meta).toEqual({ count: 1000, truncated: true });
    // ...and nothing went to the wire to produce it.
    expect(bffFetchMock).not.toHaveBeenCalled();
  });

  it("drops `meta` AND `data` when the window errors", async () => {
    // The error branch. `data` going undefined is what stops the page rendering
    // a stale grid under an error state, and `meta` must not survive as a claim
    // about a window that never loaded.
    bffFetchMock.mockRejectedValue(new Error("boom"));

    const seen: { data?: unknown; meta?: unknown; isError?: boolean } = {};
    function Probe() {
      const q = useCalendarQuery(WINDOW);
      seen.data = q.data;
      seen.meta = q.meta;
      seen.isError = q.isError;
      return null;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );

    // Longer than the default poll window: the hook retries once on a non-401/403
    // failure (`failureCount < 1`), so the error state is two attempts away, not
    // one. A test that gave up sooner would report a false "never errors".
    await waitFor(() => expect(seen.isError).toBe(true), { timeout: 5_000 });
    expect(seen.data).toBeUndefined();
    expect(seen.meta).toBeUndefined();
  });

  it("issues exactly one request for the window", async () => {
    // AC-4, per key: deriving `meta` must not cost a second observer or a second
    // fetch. Counted for THIS window's URL only — a neighbour prefetch would
    // legitimately fetch a different one.
    bffFetchMock.mockResolvedValue({ items: [], meta: { count: 0, truncated: false } });

    const seen = renderCalendarQuery();
    await waitFor(() => expect(seen.current?.meta).toBeDefined());

    const forThisWindow = bffFetchMock.mock.calls.filter((c) => {
      const url = new URL(String(c[0]), "http://localhost");
      return url.searchParams.get("from") === WINDOW.from && url.searchParams.get("to") === WINDOW.to;
    });
    expect(forThisWindow).toHaveLength(1);
  });
});
