// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CalendarStaleWindowNotice } from "../calendar-stale-window-notice";

/**
 * The banner shown while the grid holds a window the header no longer names
 * (RUK-267). Presentational only — the page owns what Retry does, because a
 * bare `refetch()` does not issue a request in the state this banner reports.
 */

afterEach(() => {
  cleanup();
});

describe("CalendarStaleWindowNotice", () => {
  it("states that the period is still loading and the events are the previous ones", () => {
    render(<CalendarStaleWindowNotice onRetry={() => {}} />);

    // Pinned character for character. The wording is load-bearing: it must not
    // claim a FAILURE, because `isPlaceholderData` does not prove one — the
    // request may still be in flight, or hung on a dead session.
    expect(screen.getByTestId("calendar-stale-window-notice").textContent).toContain(
      "Still loading this period — showing the last loaded events.",
    );
  });

  it("is a polite live region, not an assertive one", () => {
    // AC-14. `Alert` defaults to role="alert"; without the explicit override
    // this silently regresses to an assertive region that interrupts the screen
    // reader mid-sentence, and nothing else in the suite would notice.
    render(<CalendarStaleWindowNotice onRetry={() => {}} />);

    expect(screen.getByTestId("calendar-stale-window-notice").getAttribute("role")).toBe("status");
  });

  it("calls onRetry when Retry is clicked", () => {
    const onRetry = vi.fn();
    render(<CalendarStaleWindowNotice onRetry={onRetry} />);

    screen.getByRole("button", { name: /retry/i }).click();

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("takes no space in the layout flow", () => {
    // AC-12's component half. The grid below is a fixed viewport-bound height,
    // so a banner occupying flow would push it down and give the page a
    // scrollbar — 1.5s after a click, under a cursor aiming at the next chevron.
    render(<CalendarStaleWindowNotice onRetry={() => {}} />);

    expect(screen.getByTestId("calendar-stale-window-notice").className).toContain("absolute");
  });

  it("does not float over the grid's day-header row", () => {
    // Found in the browser, not here: at `top-2` the banner covered
    // FullCalendar's day headers (Mon 8/17, Tue 8/18…) — measured, notice at
    // 140-182px against a header row at 138-168px. A banner whose entire purpose
    // is to say which DATES the events belong to must not be painted over those
    // dates.
    //
    // jsdom computes no real layout, so this pins the offset that clears the
    // header rather than the geometry. Crude, and still worth having: it is what
    // turns a fix verified once by eye into one that stays fixed.
    render(<CalendarStaleWindowNotice onRetry={() => {}} />);

    const className = screen.getByTestId("calendar-stale-window-notice").className;
    expect(className).toContain("top-14");
    expect(className).not.toContain("top-2 ");
  });
});
