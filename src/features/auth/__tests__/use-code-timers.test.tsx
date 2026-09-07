// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

import { CODE_TTL_SECONDS, MAX_CODE_ATTEMPTS, useCodeTimers } from "@/features/auth/use-code-timers";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Probe({ active }: { active: boolean }) {
  const timers = useCodeTimers(active);
  return (
    <div>
      <span data-testid="remaining">{timers.remaining}</span>
      <button type="button" onClick={timers.start}>
        start
      </button>
    </div>
  );
}

function remaining() {
  return Number(screen.getByTestId("remaining").textContent);
}

describe("the countdown is derived from a deadline, not decremented", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(new Date("2026-09-07T12:00:00Z"));
  });

  // The case a decrementing counter gets wrong. A backgrounded tab, a laptop
  // waking from sleep and a bfcache restore all suspend the interval; a counter
  // then resumes from where it stopped and OVER-reports the time left, showing
  // "expires in 4:12" for a code the backend has already discarded.
  it("catches up after the tab is suspended, rather than resuming where it paused", () => {
    render(<Probe active />);
    act(() => {
      screen.getByRole("button", { name: "start" }).click();
    });
    expect(remaining()).toBe(CODE_TTL_SECONDS);

    // The clock jumps two minutes while the interval fires only once — a
    // throttled or suspended tab. A decrementing counter would read 299 here,
    // because it only ever subtracts what it observed.
    act(() => {
      vi.setSystemTime(new Date("2026-09-07T12:02:00Z"));
      vi.advanceTimersByTime(1000);
    });

    // 120s of wall clock plus the 1s the tick itself advanced.
    expect(remaining()).toBe(CODE_TTL_SECONDS - 121);
    expect(remaining()).toBeLessThan(CODE_TTL_SECONDS - 100);
  });

  it("floors at zero rather than going negative", () => {
    render(<Probe active />);
    act(() => {
      screen.getByRole("button", { name: "start" }).click();
    });

    act(() => {
      vi.setSystemTime(new Date("2026-09-07T12:10:00Z"));
      vi.advanceTimersByTime(1000);
    });

    expect(remaining()).toBe(0);
  });

  it("stops ticking once the step is left", () => {
    const { rerender } = render(<Probe active />);
    act(() => {
      screen.getByRole("button", { name: "start" }).click();
    });

    rerender(<Probe active={false} />);
    const frozen = remaining();

    act(() => {
      vi.setSystemTime(new Date("2026-09-07T12:00:30Z"));
      vi.advanceTimersByTime(5000);
    });

    // No interval is running, so nothing recomputes: the value is whatever the
    // last active tick left, and `active` gating is what tears it down.
    expect(remaining()).toBe(frozen);
  });
});

describe("the contract constants", () => {
  // Pinned as literals. Every other suite derives its loops from these, so
  // without this the whole budget story is self-fulfilling.
  it("match the backend's configuration", () => {
    expect(CODE_TTL_SECONDS).toBe(300);
    expect(MAX_CODE_ATTEMPTS).toBe(5);
  });
});
