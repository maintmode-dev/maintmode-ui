// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OrganizationSuspendedPage } from "../organization-suspended-page";

// This config has no global testing-library auto-cleanup, so unmount between
// tests to keep the document free of stale renders.
afterEach(() => cleanup());

describe("OrganizationSuspendedPage", () => {
  let assignMock: ReturnType<typeof vi.fn>;
  let originalLocation: Location;

  beforeEach(() => {
    // jsdom's `window.location` is sealed; replace the whole property
    // descriptor so we can spy on `.assign()` — same pattern the bff-fetch
    // test uses to seal `.replace()`.
    originalLocation = window.location;
    assignMock = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { assign: assignMock } as unknown as Location,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it("renders the suspended title and caption", () => {
    render(<OrganizationSuspendedPage />);
    expect(screen.getByRole("heading", { name: "Organization suspended" })).toBeTruthy();
    expect(
      screen.getByText(
        "Your organization's access is paused. Contact your provider or administrator to restore it.",
      ),
    ).toBeTruthy();
  });

  it("marks the status icon as decorative (aria-hidden)", () => {
    const { container } = render(<OrganizationSuspendedPage />);
    // The lucide glyph is decorative — copy carries the meaning — so it must
    // not be announced to assistive tech.
    const icon = container.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  });

  it("exposes recovery as a real button labelled 'Try again'", () => {
    render(<OrganizationSuspendedPage />);
    const cta = screen.getByRole("button", { name: "Try again" });
    expect(cta.tagName).toBe("BUTTON");
  });

  it("re-enters the app read-only via assign('/') when Try again is clicked", () => {
    render(<OrganizationSuspendedPage />);
    screen.getByRole("button", { name: "Try again" }).click();
    expect(assignMock).toHaveBeenCalledTimes(1);
    expect(assignMock).toHaveBeenCalledWith("/");
  });
});
