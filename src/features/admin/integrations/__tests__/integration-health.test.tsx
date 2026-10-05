// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { IntegrationHealthBadge } from "../integration-health";

afterEach(cleanup);

/**
 * The one rule this component exists to hold: absence is not health.
 *
 * `health` is `omitempty` on the wire and a login row can arrive without it,
 * so a default of "working" would report a provider nobody can sign in through
 * as fine. The assertions below are written against that failure, not against
 * the happy path — a badge that renders "Active" for everything passes a
 * "renders the label" test and fails these.
 */
describe("IntegrationHealthBadge", () => {
  it("reports an absent value as unknown, never as working", () => {
    render(<IntegrationHealthBadge />);

    expect(screen.getByText(/unknown/i)).toBeTruthy();
    expect(screen.queryByText(/configured/i)).toBeNull();
  });

  /**
   * The backend's `ok` means the settings parsed, validated and the provider was
   * built — discovery runs lazily on the first sign-in and credentials are never
   * checked, so mock credentials read `ok` too. "Active" promised that sign-in
   * works; "Configured" says what the backend actually knows.
   */
  it("words ok as configured, not as working", () => {
    render(<IntegrationHealthBadge health="ok" />);

    expect(screen.getByText("Configured")).toBeTruthy();
    expect(screen.queryByText(/active|working/i)).toBeNull();
  });

  it("names each of the four backend states distinctly", () => {
    const seen = new Set<string>();
    for (const health of ["ok", "unresolved", "disabled", "unreadable"] as const) {
      const { container, unmount } = render(<IntegrationHealthBadge health={health} />);
      const text = container.textContent ?? "";
      expect(text.trim()).not.toBe("");
      seen.add(text);
      unmount();
    }
    // Four states, four different words: collapsing any two would make a
    // working provider and a broken one read the same.
    expect(seen.size).toBe(4);
  });

  /**
   * `unresolved` is what a correctly saved provider reads as until the
   * backend's snapshot catches up, so the copy must not accuse it of being
   * broken — an operator sent debugging a non-problem is the failure here.
   */
  it("does not word unresolved as a failure", () => {
    render(<IntegrationHealthBadge health="unresolved" />);

    expect(screen.queryByText(/fail|error|broken|invalid/i)).toBeNull();
  });
});
