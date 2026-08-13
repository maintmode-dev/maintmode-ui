// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCalendarWindow, STEP_DEBOUNCE_MS, MAX_WAIT_MS } from "../use-calendar-window";

/**
 * The window that reaches the query key, decoupled from the window the header
 * renders (RUK-260).
 *
 * Three behaviours are pinned here, and each exists because of a specific way
 * the naive version fails:
 *
 *  - **Trailing debounce.** Without it every prev/next click is its own cache
 *    key, so a burst costs one request and one full re-map per click.
 *  - **Leading-edge latch.** A plain trailing debounce also delays the FIRST
 *    window. On this page that is not merely slow: the page adopts its stored
 *    view in the same mount effect that opens the query gate, so a lagging
 *    debounce still holds the default Day window at the moment the gate opens
 *    and fires a request for a window nobody asked for — the exact defect
 *    `calendar-hydration-gate.test.tsx` pins. Verified by probe: the seed does
 *    reach an enabled commit.
 *  - **Max wait.** A pure trailing debounce can be starved forever by clicks
 *    that keep arriving just under the threshold, leaving the header and grid
 *    ahead of the data with no loading indicator (`keepPreviousData` keeps the
 *    old window on screen, so `isPending` is false).
 */

const A = { from: "2026-08-01", to: "2026-08-01" };
const B = { from: "2026-08-02", to: "2026-08-02" };
const C = { from: "2026-08-03", to: "2026-08-03" };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useCalendarWindow", () => {
  it("adopts the first window immediately, with no wait (the latch)", () => {
    const { result } = renderHook(({ w }) => useCalendarWindow(w), { initialProps: { w: A } });
    // Before any timer runs at all.
    expect(result.current).toEqual(A);
  });

  it("passes a change through untouched while the window is still provisional", () => {
    // The cold path: the page swaps the default Day window for the stored Month
    // one in the same commit that opens its query gate. Until that gate opens
    // (`live: false`) nothing is being fetched, so these windows must reach the
    // caller in the SAME render — a value delivered one effect later is already
    // too late, and the gate would open on the discarded window.
    const { result, rerender } = renderHook(({ w, live }) => useCalendarWindow(w, live), {
      initialProps: { w: A, live: false },
    });
    rerender({ w: B, live: false });
    // No timers advanced, and no extra commit: B is live already.
    expect(result.current).toEqual(B);
  });

  it("closes the latch on the first LIVE window, then debounces", () => {
    const { result, rerender } = renderHook(({ w, live }) => useCalendarWindow(w, live), {
      initialProps: { w: A, live: true },
    });
    act(() => {
      vi.advanceTimersByTime(STEP_DEBOUNCE_MS);
    });

    rerender({ w: B, live: true });
    // Now a change must WAIT. If the latch reopened, this would already be B.
    expect(result.current).toEqual(A);

    act(() => {
      vi.advanceTimersByTime(STEP_DEBOUNCE_MS);
    });
    expect(result.current).toEqual(B);
  });

  it("collapses a burst into the FINAL window, not an intermediate one", () => {
    const { result, rerender } = renderHook(({ w }) => useCalendarWindow(w), {
      initialProps: { w: A },
    });
    act(() => {
      vi.advanceTimersByTime(STEP_DEBOUNCE_MS);
    });

    // Two steps in quick succession, each inside the quiet period.
    rerender({ w: B });
    act(() => {
      vi.advanceTimersByTime(STEP_DEBOUNCE_MS - 50);
    });
    rerender({ w: C });
    expect(result.current).toEqual(A); // still nothing published

    act(() => {
      vi.advanceTimersByTime(STEP_DEBOUNCE_MS);
    });
    // C, never B: the intermediate window is the one a per-click fetch wastes.
    expect(result.current).toEqual(C);
  });

  it("publishes within MAX_WAIT_MS even while changes keep arriving", () => {
    const { result, rerender } = renderHook(({ w }) => useCalendarWindow(w), {
      initialProps: { w: A },
    });
    act(() => {
      vi.advanceTimersByTime(STEP_DEBOUNCE_MS);
    });

    // Clicks that never stop, each one under the quiet threshold: a pure
    // trailing debounce publishes nothing, ever.
    let day = 2;
    const tick = () => {
      const d = String(day++).padStart(2, "0");
      rerender({ w: { from: `2026-08-${d}`, to: `2026-08-${d}` } });
      act(() => {
        vi.advanceTimersByTime(STEP_DEBOUNCE_MS - 50);
      });
    };
    for (let i = 0; i < 8; i++) tick();

    // 8 * 200ms = 1600ms of continuous stepping: the cap must have fired.
    expect(result.current).not.toEqual(A);
  });

  it("treats a window that only changed its END as a change, latch still open", () => {
    // A Day→Week switch on the same anchor moves `to` and leaves `from` alone.
    // Every other case in this file uses single days, where `from` and `to` move
    // together — so a comparison that looked at `from` only would pass all of
    // them and still be wrong.
    //
    // Driven with `live: false`, deliberately: that is the path where the window
    // is compared as a WHOLE (the render-time latch). Once the latch is closed
    // the effect compares the two fields itself, so a broken whole-window
    // comparison is invisible there — which is how the first version of this
    // test passed against the very mutation it was written to catch.
    const dayA = { from: "2026-08-01", to: "2026-08-01" };
    const weekA = { from: "2026-08-01", to: "2026-08-07" };
    const { result, rerender } = renderHook(({ w, live }) => useCalendarWindow(w, live), {
      initialProps: { w: dayA, live: false },
    });
    expect(result.current).toEqual(dayA);

    rerender({ w: weekA, live: false });
    // Published in the same render, with no timers advanced — the widened window
    // must be seen as a change, not mistaken for the day it starts on.
    expect(result.current).toEqual(weekA);
  });

  it("drops its pending publish when the caller unmounts mid-wait", () => {
    // Stepping and then navigating away is ordinary, not exotic: without the
    // cleanup the timer fires into an unmounted component.
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender, unmount } = renderHook(({ w }) => useCalendarWindow(w), {
      initialProps: { w: A },
    });
    act(() => {
      vi.advanceTimersByTime(STEP_DEBOUNCE_MS);
    });
    rerender({ w: B }); // now withheld, timer armed
    unmount();

    act(() => {
      vi.advanceTimersByTime(MAX_WAIT_MS * 2);
    });
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("re-arms the max-wait cap so a long hold keeps publishing", () => {
    const { result, rerender } = renderHook(({ w }) => useCalendarWindow(w), {
      initialProps: { w: A },
    });
    act(() => {
      vi.advanceTimersByTime(STEP_DEBOUNCE_MS);
    });

    let day = 2;
    const stepFor = (ms: number) => {
      const until = ms / (STEP_DEBOUNCE_MS - 50);
      for (let i = 0; i < until; i++) {
        const d = String(day++).padStart(2, "0");
        rerender({ w: { from: `2026-08-${d}`, to: `2026-08-${d}` } });
        act(() => {
          vi.advanceTimersByTime(STEP_DEBOUNCE_MS - 50);
        });
      }
    };

    stepFor(MAX_WAIT_MS + 200);
    const afterFirstCap = result.current;
    stepFor(MAX_WAIT_MS + 200);
    // A one-shot cap would leave the window stuck at the first flush and starve
    // again from there.
    expect(result.current).not.toEqual(afterFirstCap);
  });
});
