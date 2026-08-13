// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * The stale-window banner, at the page level (RUK-267).
 *
 * The defect these pin is narrow and was twice mis-stated before it was
 * measured, so it is worth naming precisely. Stepping the calendar keeps the
 * previous window's events on screen while the next one loads. The header, the
 * anchor and the grid all move on the click; only the DATA lags. So there is a
 * window of time — a few hundred ms normally, forever on a dead session — where
 * the operator reads one period's dates over another period's work.
 *
 * What it is NOT: a settled error. TanStack drops the retained data when the
 * query settles into error, so `isError` never coexists with data and the
 * existing full-screen error branch is already correct. Both the ticket and the
 * first draft of the spec proposed conditions that could never be true.
 *
 * Every test here drives the REAL `useCalendarQuery` through a stubbed `fetch`
 * and asserts on the DOM. A test that mocked the hook could pin a state
 * production never produces, which is exactly the failure mode above.
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

import { CalendarPage } from "../calendar-page";

/**
 * A short threshold, injected for the tests.
 *
 * The page ships 1500 ms; these tests drive REAL timers, so using that number
 * would put ~2 s of wall clock into every test here. It cannot be faked away:
 * measured, a single `act` block wrapping a long sleep does not let the step
 * debounce flush — the request goes out only when the block ends, so the whole
 * sequence collapses and nothing is actually observed. The debounce test next
 * door hit the same wall and settled on the same answer: real time, small
 * numbers, `waitFor` on the outcome.
 */
const TEST_DELAY_MS = 120;

/** Past the debounce (250) plus the injected threshold, with room to spare. */
const PAST_THRESHOLD_MS = 700;

const NOW = new Date();

/** One event, so the grid renders rather than the empty state. */
const oneEvent = (id: string, title: string) => ({
  id,
  title,
  status: "in_progress",
  resources: [],
  planned_period: {
    start: new Date(NOW.getTime() - 60 * 60_000).toISOString(),
    end: new Date(NOW.getTime() + 10 * 60 * 60_000).toISOString(),
  },
});

const W1 = { items: [oneEvent("m-1", "W1 core switch upgrade")] };
const W2 = { items: [oneEvent("m-2", "W2 database failover")] };

type Responder = (url: string, call: number) => Promise<Response>;

let calendarCalls: string[] = [];
let responder: Responder;

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

/** A request that never settles — the shape `bffFetch` returns on a 401. */
const hang = () => new Promise<Response>(() => {});

beforeEach(() => {
  calendarCalls = [];
  storageStore.clear();
  responder = async (_url, call) => (call === 1 ? json(W1) : hang());

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes("/api/calendar")) return json({});
      calendarCalls.push(url);
      return responder(url, calendarCalls.length);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
  // `retry: false` keeps a failing window to a single attempt, so the assertions
  // describe one request rather than the hook's default two.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const notice = () => screen.queryByTestId("calendar-stale-window-notice");
const truncation = () => screen.queryByTestId("calendar-truncation-notice");

/** Render and wait for the first window, so a step starts from a real baseline. */
async function renderWithFirstWindow() {
  render(<CalendarPage staleNoticeDelayMs={TEST_DELAY_MS} />, { wrapper });
  await waitFor(() => expect(screen.getAllByText("W1 core switch upgrade").length).toBeGreaterThan(0));
}

/**
 * Let real time pass in small slices, optionally sampling between them.
 *
 * Sliced rather than one long sleep: a single `act` wrapping the whole wait does
 * not let the step debounce flush, so the request only goes out when the block
 * ends and the in-flight state is never observed. Measured — that is what made
 * the first version of these tests fail against a correct implementation.
 *
 * `onSlice` exists because one test has to watch for a banner that should never
 * appear, and a check after the wait cannot see something transient.
 */
async function elapse(ms: number, onSlice?: () => void, slice = 40) {
  for (let waited = 0; waited < ms; waited += slice) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, slice));
    });
    onSlice?.();
  }
}

async function stepForward(ms: number) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
  });
  await elapse(ms);
}

describe("stale window notice", () => {
  it("raises the notice while the previous window's events are still on screen", async () => {
    // AC-1. Both halves asserted together: the notice alone would also appear if
    // the page had fallen into some other branch, and the events alone would
    // pass on a build with no notice at all.
    await renderWithFirstWindow();
    await stepForward(PAST_THRESHOLD_MS);

    expect(notice()).not.toBeNull();
    expect(screen.getAllByText("W1 core switch upgrade").length).toBeGreaterThan(0);
  });

  it("does not fall back to the full-screen error state", async () => {
    // AC-2. Paired with a positive assertion, or this would also pass on a page
    // that rendered nothing at all.
    await renderWithFirstWindow();
    await stepForward(PAST_THRESHOLD_MS);

    expect(screen.queryByText("Couldn't load calendar")).toBeNull();
    expect(notice()).not.toBeNull();
  });

  it("stays silent when the step resolves quickly", async () => {
    // AC-3, the false-positive guard: an ordinary step must never flash the
    // banner, because a warning that fires on every chevron click is one
    // operators learn to ignore.
    //
    // Honest status: a GUARD, not a bite, and the reason is worth recording.
    // Setting the threshold to 0 does NOT make this fail — measured, sampling
    // every 10 ms across the whole step saw the notice 0 times out of 80. With
    // an immediate response `isPlaceholderData` is true only within a single
    // React commit, so there is no paint in which the banner exists and nothing
    // observable to catch. The delay's real protection against a slow-but-fine
    // network is covered by `useDelayedFlag`'s own unit tests, which DO bite.
    //
    // It samples continuously anyway rather than checking once at the end: that
    // is the strongest form available here, and it would catch a build that left
    // the banner up after the window landed.
    responder = async (_url, call) => (call === 1 ? json(W1) : json(W2));

    await renderWithFirstWindow();

    // Sample CONTINUOUSLY across the step rather than checking once at the end.
    // A single check afterwards cannot fail: with the threshold at 0 the notice
    // appears and disappears inside the step, so by the time the window has
    // landed it is gone either way. Measured — the end-state assertion passed
    // against a build with the delay set to 0, which is precisely the
    // false-positive this AC exists to catch.
    let everSeen = false;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    });
    await elapse(
      800,
      () => {
        if (notice()) everSeen = true;
      },
      20,
    );

    await waitFor(() => expect(screen.getAllByText("W2 database failover").length).toBeGreaterThan(0));
    expect(everSeen).toBe(false);
    expect(notice()).toBeNull();
  });

  it("shows the full-screen error, not the notice, when there is no previous window", async () => {
    // AC-4. The cold path must be untouched: with nothing retained there is no
    // context to preserve, so the error state is the correct rendering.
    responder = async () =>
      new Response(JSON.stringify({ error: "boom" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });

    render(<CalendarPage staleNoticeDelayMs={TEST_DELAY_MS} />, { wrapper });

    await waitFor(() => expect(screen.queryByText("Couldn't load calendar")).not.toBeNull(), {
      timeout: 5000,
    });
    expect(notice()).toBeNull();
  });

  it("clears the notice when the window simply arrives, with no Retry", async () => {
    // The ordinary recovery path, and it was missing: the only place the notice
    // was seen to disappear was inside the Retry test, where it is inseparable
    // from cancelQueries + refetch. An implementation that only cleared the
    // banner on Retry would have passed the whole suite.
    let release!: (r: Response) => void;
    responder = async (_url, call) =>
      call === 1 ? json(W1) : new Promise<Response>((resolve) => (release = resolve));

    await renderWithFirstWindow();
    await stepForward(PAST_THRESHOLD_MS);
    expect(notice()).not.toBeNull();

    const before = calendarCalls.length;
    await act(async () => {
      release(json(W2));
    });

    await waitFor(() => expect(notice()).toBeNull());
    expect(screen.getAllByText("W2 database failover").length).toBeGreaterThan(0);

    // The window landed on its own — nothing re-requested it. Asserted per
    // WINDOW rather than as a total count: settling also lets the neighbour
    // prefetch warm the NEXT window (RUK-260), so the total does grow, and a
    // bare count would have been asserting the prefetch's behaviour by accident.
    const stepped = new URL(calendarCalls[before - 1], "http://x").searchParams.get("from");
    const refetchedSame = calendarCalls
      .slice(before)
      .filter((url) => new URL(url, "http://x").searchParams.get("from") === stepped);
    expect(refetchedSame).toHaveLength(0);
  });

  it("keeps the grid interactive while stale: an event still opens the quick-sheet", async () => {
    // AC-8. The confirmed constraint behind the whole design: the banner does
    // not disable anything, because the quick-sheet fetches a maintenance by its
    // own id, so clicking a retained event shows real data rather than a lie.
    //
    // This AC was marked done in the plan while no test existed for it — caught
    // by the pre-ship coverage pass.
    await renderWithFirstWindow();
    await stepForward(PAST_THRESHOLD_MS);
    expect(notice()).not.toBeNull();

    // The retained event is still a live target.
    const event = screen.getAllByText("W1 core switch upgrade")[0];
    await act(async () => {
      fireEvent.click(event);
    });

    await waitFor(() => expect(screen.queryAllByRole("dialog").length).toBeGreaterThan(0));
    // And the banner does not vanish just because a sheet opened over it.
    expect(notice()).not.toBeNull();
  });

  it("hands over to the full-screen error once a slow failure settles", async () => {
    // Raised in review as "the banner is a prelude to losing the context it
    // exists to preserve". Reproduced, and worth pinning as the intended
    // sequence rather than leaving it as folklore: banner while in flight, then
    // `CalendarError` once the request settles.
    //
    // It is not the banner failing. A settled error carries NO retained data —
    // the finding this whole ticket rests on — so there is nothing left to show
    // beside the header, and the full-screen error is the only honest rendering.
    // The banner covered the in-flight period truthfully; this is what comes
    // after. (A FAST 5xx never shows the banner at all: it settles inside the
    // threshold, which is what the "stays silent" test above covers.)
    let slow = false;
    responder = async (_url, call) => {
      if (call === 1) return json(W1);
      slow = true;
      await new Promise((r) => setTimeout(r, 400));
      return new Response(JSON.stringify({ error: "boom" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    };

    await renderWithFirstWindow();
    await stepForward(PAST_THRESHOLD_MS);
    expect(slow).toBe(true);
    expect(notice()).not.toBeNull();

    // Let the failure settle. Both halves asserted: the banner must go AND the
    // error must arrive — either alone would pass on a page stuck mid-transition.
    await waitFor(() => expect(screen.queryByText("Couldn't load calendar")).not.toBeNull(), {
      timeout: 5000,
    });
    expect(notice()).toBeNull();
  });

  it("retries the period on screen, not the one the request still points at", async () => {
    // Found in review, then reproduced: the request window is debounced and lags
    // the header by up to MAX_WAIT_MS, so a Retry clicked during that quiet
    // period used to cancel and refetch the period the operator had already
    // stepped away from. Measured before the fix — header on Aug 15, request for
    // Aug 14, plus a wasted duplicate. Retry sits under a banner that says "this
    // period"; it has to mean the one being read.
    await renderWithFirstWindow();
    await stepForward(PAST_THRESHOLD_MS);
    expect(notice()).not.toBeNull();

    // Step again and click Retry INSIDE the debounce, before the request window
    // has caught up with the header.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    });
    const before = calendarCalls.length;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    await act(async () => {
      screen.getByRole("button", { name: /retry/i }).click();
    });
    await elapse(300);

    const targeted = calendarCalls
      .slice(before)
      .map((url) => new URL(url, "http://x").searchParams.get("from"));
    // The header renders the third window; every request the retry provoked must
    // be for that one, never for the window left behind.
    const abandoned = new URL(calendarCalls[before - 1], "http://x").searchParams.get("from");
    expect(targeted.length).toBeGreaterThan(0);
    expect(targeted).not.toContain(abandoned);
  });

  it("issues a real request when Retry is clicked, and clears once it lands", async () => {
    // AC-5, the load-bearing one. A bare `refetch()` does NOT issue a request
    // here: `Query.fetch` only restarts an in-flight request when the cache
    // entry already holds data, and this key's entry never has — the events on
    // screen came from the placeholder. Measured on the naive implementation:
    // three clicks, zero requests. So this asserts CAUSALITY, not just recovery.
    await renderWithFirstWindow();
    await stepForward(PAST_THRESHOLD_MS);
    expect(notice()).not.toBeNull();

    // Control: the count must be stable while we sit in the state, so the
    // increment below can only be attributed to the click.
    const beforeIdle = calendarCalls.length;
    await elapse(400);
    expect(calendarCalls.length).toBe(beforeIdle);

    // From here the window answers, so the retry can actually succeed.
    responder = async () => json(W2);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    });
    await elapse(200);

    expect(calendarCalls.length).toBeGreaterThan(beforeIdle);
    await waitFor(() => expect(notice()).toBeNull());
    expect(screen.getAllByText("W2 database failover").length).toBeGreaterThan(0);
  });

  it("does not show a truncation count belonging to the retained window", async () => {
    // AC-6, and honestly a GUARD rather than a bite today. Measured: with the
    // page's suppression removed entirely, this still passes — because
    // `useCalendarQuery` already blanks `meta` under placeholder data
    // (RUK-265), so the notice is gone before this layer gets a say. The spec
    // hoped to force a truncated `meta` to make it bite; that is not reachable
    // from a fixture, since the blanking is unconditional inside the hook.
    //
    // Kept deliberately. What it pins is the RULE, not today's mechanism: the
    // retained window's count must never appear under the new header, because a
    // confidently wrong number is worse than silence (RUK-252). If RUK-265's
    // invariant is ever relaxed, this is what notices — and relying on another
    // ticket's internal to keep a wrong count off screen is exactly how it comes
    // back.
    responder = async (_url, call) =>
      call === 1 ? json({ ...W1, meta: { count: 1000, truncated: true } }) : hang();

    await renderWithFirstWindow();
    await waitFor(() => expect(truncation()).not.toBeNull());

    await stepForward(PAST_THRESHOLD_MS);

    expect(notice()).not.toBeNull();
    expect(truncation()).toBeNull();
  });

  it("treats a filter change the same as a step", async () => {
    // AC-7. The status chips are part of the query key, so toggling one is a
    // window change by another name — the ticket asks this path be checked.
    await renderWithFirstWindow();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Draft" }));
    });
    await elapse(PAST_THRESHOLD_MS);

    expect(notice()).not.toBeNull();
    expect(screen.getAllByText("W1 core switch upgrade").length).toBeGreaterThan(0);
  });

  it("keeps the notice up across a further step, without re-counting the delay", async () => {
    // AC-11. `isPlaceholderData` stays true without a gap when the key changes
    // again, so the flag must not reset. An implementation that reset on key
    // change would pass every other test here and hide the warning for another
    // 1.5s on each step — while the screen keeps lying.
    await renderWithFirstWindow();
    await stepForward(PAST_THRESHOLD_MS);
    expect(notice()).not.toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    });
    // Only the debounce, deliberately: far less than the threshold. If the flag
    // had reset, the notice would be gone at this instant.
    await elapse(280);

    expect(notice()).not.toBeNull();
  });

  it("does not claim the period is empty while it is still loading", async () => {
    // AC-13. `CalendarEmpty` says "No maintenance scheduled for this period",
    // which is a claim about the HEADER's period — not the one the retained
    // events came from. With an empty retained window the page would otherwise
    // assert emptiness about a period it has never loaded, right beside a banner
    // saying it is still loading.
    responder = async (_url, call) => (call === 1 ? json({ items: [] }) : hang());

    render(<CalendarPage staleNoticeDelayMs={TEST_DELAY_MS} />, { wrapper });
    await waitFor(() =>
      expect(screen.queryByText("No maintenance scheduled for this period")).not.toBeNull(),
    );

    await stepForward(PAST_THRESHOLD_MS);

    expect(notice()).not.toBeNull();
    expect(screen.queryByText("No maintenance scheduled for this period")).toBeNull();
  });

  it("raises the notice on a request that never settles, and keeps it up", async () => {
    // AC-15. The motivating case: `bffFetch` answers a 401 with a promise that
    // never resolves, so the UI cannot flash an error during the redirect to
    // /login. The query parks in this state permanently rather than transiently,
    // which is why the ticket's author measured it as terminal.
    await renderWithFirstWindow();
    await stepForward(PAST_THRESHOLD_MS);
    expect(notice()).not.toBeNull();

    await elapse(600);

    expect(notice()).not.toBeNull();
    expect(screen.getAllByText("W1 core switch upgrade").length).toBeGreaterThan(0);
  });
});
