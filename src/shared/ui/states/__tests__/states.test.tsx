// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
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
    expect(screen.getByText("No maintenance scheduled for this week")).toBeTruthy();
    expect(screen.getByText("Plan one to coordinate with your team.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /New maintenance/i })).toBeTruthy();
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

  it("tone: no emoji, no Oops/Sorry/Failed across all states", () => {
    const all = [
      <CalendarEmpty key="ce" />,
      <CalendarError key="cer" />,
      <DetailsNotFound key="dnf" />,
      <DetailsForbidden key="df" />,
      <DetailsError key="de" />,
      <AuditEmpty key="ae" />,
      <AuditError key="aer" />,
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
  });
});
