// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApprovalsEmpty,
  ApprovalsError,
  ApprovalsLoading,
  ApprovalsPageEmptied,
  AuditEmpty,
  AuditError,
  AuditLoading,
  CalendarEmpty,
  CalendarError,
  CalendarLoading,
  DetailsError,
  DetailsForbidden,
  DetailsLoading,
  DetailsNotFound,
} from "../index";

describe("state components — canonical copy contract", () => {
  afterEach(() => cleanup());

  it("CalendarEmpty uses canonical title + caption", () => {
    render(<CalendarEmpty />);
    expect(screen.getByText("No maintenance scheduled for this period")).toBeTruthy();
    expect(screen.getByText("Plan one to coordinate with your team.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /New maintenance/i })).toBeTruthy();
    // RUK-262: the default title must not name a period, since this component
    // renders in all three views. Catches only the three view words — a novel
    // period phrase ("this weekend") is guarded by the literal above instead.
    // Must stay scoped to the heading node; on the container the sibling text
    // concatenates and the invariant goes dead (spec §8.1).
    expect(screen.getByRole("heading").textContent).not.toMatch(/\bthis (week|day|month)\b/i);
  });

  it("CalendarEmpty: an explicit title overrides the default", () => {
    // The "hidden by filters" variant (calendar-page.tsx:302) is the only
    // consumer that passes `title`, and it has no other test.
    render(<CalendarEmpty title="No maintenance matches your filters" />);
    expect(screen.getByText("No maintenance matches your filters")).toBeTruthy();
  });

  it("CalendarError offers a Retry CTA — no HTTP code in copy", () => {
    const { container } = render(<CalendarError />);
    expect(screen.getByText("Couldn't load calendar")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Retry/i })).toBeTruthy();
    expect(container.textContent).not.toMatch(/\b(40[0-9]|5[0-9]{2})\b/);
  });

  it("DetailsNotFound uses canonical copy + Back CTA", () => {
    render(<DetailsNotFound />);
    expect(screen.getByText("Maintenance not found")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Back to calendar/i })).toBeTruthy();
  });

  it("DetailsForbidden has NO CTA (frozen: read-only explanation)", () => {
    render(<DetailsForbidden />);
    expect(screen.getByText("You don't have access")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("DetailsError offers a Retry CTA", () => {
    render(<DetailsError />);
    expect(screen.getByText("Couldn't load maintenance")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Retry/i })).toBeTruthy();
  });

  it("AuditEmpty offers Back to maintenance CTA", () => {
    render(<AuditEmpty />);
    expect(screen.getByText("No history yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Back to maintenance/i })).toBeTruthy();
  });

  it("AuditError uses the same Retry pattern", () => {
    render(<AuditError />);
    expect(screen.getByText("Couldn't load history")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Retry/i })).toBeTruthy();
  });

  it("ApprovalsEmpty has NO CTA and does not congratulate", () => {
    render(<ApprovalsEmpty />);
    expect(screen.getByText("Nothing is waiting for your approval")).toBeTruthy();
    // No CTA: there is nothing for a reviewer to do from an empty queue.
    expect(screen.queryByRole("button")).toBeNull();
    // And no "all caught up" framing — until the rework flow exists, a draft
    // the reviewer won't approve and won't cancel simply stays here, so an
    // empty queue is not reliably an achievement.
    expect(document.body.textContent).not.toMatch(/caught up|all done|great|nice work|inbox zero/i);
  });

  it("ApprovalsError offers a Retry CTA — no HTTP code in copy", () => {
    const { container } = render(<ApprovalsError />);
    expect(screen.getByText("Couldn't load approvals")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Retry/i })).toBeTruthy();
    expect(container.textContent).not.toMatch(/\b(40[0-9]|5[0-9]{2})\b/);
  });

  it("ApprovalsPageEmptied offers a way back to the first page", () => {
    // The CTA is the whole point of this state: the offset lives in component
    // state, so without it an emptied later page is a dead end.
    const onBackToStart = vi.fn();
    render(<ApprovalsPageEmptied onBackToStart={onBackToStart} />);
    expect(screen.getByText("This page is empty now")).toBeTruthy();
    const cta = screen.getByRole("button", { name: /first page/i });
    cta.click();
    expect(onBackToStart).toHaveBeenCalledOnce();
  });

  it("tone: no emoji, no Oops/Sorry/Failed across all states", () => {
    const all = [
      <CalendarEmpty key="ce" />,
      <CalendarError key="cer" />,
      <DetailsNotFound key="dnf" />,
      <DetailsForbidden key="df" />,
      <DetailsError key="de" />,
      <AuditEmpty key="ae" />,
      <AuditError key="aer" />,
      <ApprovalsEmpty key="ape" />,
      <ApprovalsError key="aper" />,
      <ApprovalsPageEmptied key="apem" />,
    ];
    for (const el of all) {
      const { container, unmount } = render(el);
      const text = container.textContent ?? "";
      expect(text).not.toMatch(/oops|sorry|failed to/i);
      // Emoji range — Misc Symbols + Pictographs + Emoticons.
      expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
      unmount();
    }
  });

  it("loading states set aria-busy=true", () => {
    const { container: cal } = render(<CalendarLoading />);
    expect(cal.firstElementChild?.getAttribute("aria-busy")).toBe("true");
    const { container: det } = render(<DetailsLoading />);
    expect(det.firstElementChild?.getAttribute("aria-busy")).toBe("true");
    const { container: aud } = render(<AuditLoading />);
    expect(aud.firstElementChild?.getAttribute("aria-busy")).toBe("true");
    // Skeleton itself is aria-hidden, so without this the screen reader gets
    // silence rather than a busy state while the queue loads.
    const { container: apr } = render(<ApprovalsLoading />);
    expect(apr.firstElementChild?.getAttribute("aria-busy")).toBe("true");
    expect(apr.firstElementChild?.getAttribute("aria-live")).toBe("polite");
  });
});
