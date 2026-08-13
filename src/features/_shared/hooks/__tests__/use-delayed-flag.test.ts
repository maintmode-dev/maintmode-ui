// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDelayedFlag } from "../use-delayed-flag";

/**
 * "Has this condition held continuously for long enough to be worth showing?"
 * (RUK-267 AC-9).
 *
 * The calendar uses it to decide whether a window that has not arrived yet is
 * merely in flight (every ordinary step is, for a few hundred ms) or genuinely
 * stuck — the difference between a useful warning and a banner that flashes on
 * every chevron click and therefore gets ignored.
 *
 * Which of these bite, measured rather than assumed (see §7.3 of the spec — this
 * feature has a history of conditions that could not fire):
 *
 *   - the three delay tests DO bite: making the timer fire immediately turns
 *     them red;
 *   - "re-activated after a COMPLETED run" DOES bite, and caught a real defect:
 *     without the cleanup's `setElapsed(false)` the flag latches, and the next
 *     activation reports elapsed immediately;
 *   - the two OTHER re-activation tests are guards. Both interrupt the first run
 *     before it finishes, which is exactly the case where a latched flag and a
 *     correct one behave identically — so they cannot catch the defect above.
 *     Kept for the contract they state, labelled so nobody mistakes them for
 *     coverage.
 *
 * That distinction is the lesson of this file: an earlier version asserted the
 * reset was redundant "because no test could justify it". The tests simply never
 * ran the case that mattered.
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useDelayedFlag", () => {
  it("is false immediately, even while active", () => {
    const { result } = renderHook(() => useDelayedFlag(true, 1500));
    expect(result.current).toBe(false);
  });

  it("stays false just before the delay elapses", () => {
    const { result } = renderHook(() => useDelayedFlag(true, 1500));

    act(() => {
      vi.advanceTimersByTime(1499);
    });
    expect(result.current).toBe(false);
  });

  it("becomes true once the delay elapses", () => {
    const { result } = renderHook(() => useDelayedFlag(true, 1500));

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current).toBe(true);
  });

  it("never fires while inactive, however much time passes", () => {
    const { result } = renderHook(() => useDelayedFlag(false, 1500));

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(false);
  });

  it("resets to false the moment the condition goes away", () => {
    const { result, rerender } = renderHook(({ active }) => useDelayedFlag(active, 1500), {
      initialProps: { active: true },
    });

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current).toBe(true);

    rerender({ active: false });
    // Synchronously, not after another tick: the condition is gone, so the
    // thing it justified showing must go with it.
    expect(result.current).toBe(false);
  });

  it("does not let a previous run's completion satisfy a new one", () => {
    // A re-activation with a DIFFERENT delay, which is the case where a stale
    // timer would be most likely to leak into the new run. It cannot: `active`
    // is an effect dependency, so React runs the cleanup — and its
    // `clearTimeout` — before re-running the effect. The property is structural
    // rather than defended by bookkeeping.
    //
    // Honest status: a GUARD, not a bite. Measured — an earlier draft carried a
    // run-id to distinguish runs, and no mutation of it could make any test
    // fail, because the state it guarded against is unreachable. The run-id was
    // deleted as dead code; this test stays to pin the contract for a future
    // rewrite that might not keep `active` in the dependency array.
    const { result, rerender } = renderHook(({ active, delay }) => useDelayedFlag(active, delay), {
      initialProps: { active: true, delay: 1000 },
    });

    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(result.current).toBe(false);

    // Off and immediately on again — the deactivation commit does not let the
    // pending timer be cleared and re-armed on the same schedule, because the
    // new run asks for a different delay.
    rerender({ active: false, delay: 1000 });
    rerender({ active: true, delay: 5000 });

    act(() => {
      vi.advanceTimersByTime(100);
    });
    // 900 + 100 = 1000 would trip the ORIGINAL delay. The current run is 100 ms
    // old against a 5000 ms threshold, so this must still be false.
    expect(result.current).toBe(false);
  });

  it("restarts the count from zero on re-activation instead of resuming it", () => {
    // Companion to the test above, at the level the caller thinks in. This one
    // is a GUARD rather than a bite — the effect's timer cleanup already
    // enforces it, so no single-line mutation makes it fail — but it states the
    // contract in the terms the calendar depends on.
    const { result, rerender } = renderHook(({ active }) => useDelayedFlag(active, 1500), {
      initialProps: { active: true },
    });

    act(() => {
      vi.advanceTimersByTime(1400);
    });
    expect(result.current).toBe(false);

    rerender({ active: false });
    act(() => {
      vi.advanceTimersByTime(50);
    });

    rerender({ active: true });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // 1400 + 200 = 1600 > 1500, but the longest CONTINUOUS run is 200 ms.
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1300);
    });
    expect(result.current).toBe(true);
  });

  it("does not report elapsed immediately when re-activated after a COMPLETED run", () => {
    // The bite the other re-activation tests missed, and the reason they missed
    // it: both of them interrupt the first run before it finishes, which is
    // precisely the case where a latched `elapsed` and a correct one look the
    // same. Let the first run COMPLETE and the difference appears.
    //
    // Measured on the version without the cleanup reset: after a finished
    // 1000 ms run, a fresh 100 ms activation returned `true` — the threshold
    // skipped entirely, and it stayed true for the whole new run.
    const { result, rerender } = renderHook(({ active }) => useDelayedFlag(active, 1000), {
      initialProps: { active: true },
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(true);

    rerender({ active: false });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current).toBe(false);

    // A brand-new run, far shorter than the threshold. Nothing from the previous
    // run may satisfy it.
    rerender({ active: true });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe(false);

    // And it still fires correctly once THIS run reaches the threshold.
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(result.current).toBe(true);
  });

  it("clears its timer on unmount", () => {
    const { unmount } = renderHook(() => useDelayedFlag(true, 1500));
    unmount();

    // A surviving timer would call setState on an unmounted component. React
    // does not throw for that, so assert on the timer itself: nothing pending
    // means nothing can fire.
    expect(vi.getTimerCount()).toBe(0);
  });
});
