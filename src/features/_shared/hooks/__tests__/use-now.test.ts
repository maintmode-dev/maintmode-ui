// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useNow } from "../use-now";

/**
 * The calendar's live clock (RUK-265 item 1).
 *
 * These are GUARDS, not bite-tests: `useNow` does not exist on `main`, so they
 * cannot fail there. What they protect is the property the sidebar depends on —
 * a value that actually advances, and an interval that actually stops.
 */

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-23T12:00:00Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useNow", () => {
  it("starts at the current instant, read during render", () => {
    const { result } = renderHook(() => useNow());
    // Not read back out of the hook: the expectation is the clock the test set.
    expect(result.current.toISOString()).toBe("2026-06-23T12:00:00.000Z");
  });

  it("advances once per interval", () => {
    const { result } = renderHook(() => useNow(60_000));
    const first = result.current;

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.getTime()).toBe(first.getTime() + 60_000);

    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    // Three ticks in, so three minutes past the start — proves it keeps firing
    // rather than updating once.
    expect(result.current.getTime()).toBe(first.getTime() + 180_000);
  });

  it("honours a custom interval", () => {
    const { result } = renderHook(() => useNow(1_000));
    const first = result.current;

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current.getTime()).toBe(first.getTime() + 1_000);
  });

  it("does not tick before a full interval has elapsed", () => {
    const { result } = renderHook(() => useNow(60_000));
    const first = result.current;

    act(() => {
      vi.advanceTimersByTime(59_999);
    });
    expect(result.current).toBe(first);
  });

  it("stops ticking after unmount", () => {
    const { unmount } = renderHook(() => useNow(60_000));
    // Count live timers rather than the hook's value: an unmounted hook has no
    // readable return, so the interval itself is the only observable.
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
