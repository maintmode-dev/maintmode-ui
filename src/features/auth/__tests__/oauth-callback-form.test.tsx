// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OAuthCallbackForm } from "../oauth-callback-form";

afterEach(() => cleanup());

/**
 * RUK-292. The receiver's code is redeemable for 60 seconds, so the form must
 * submit itself rather than wait on a click — but it must remain a real form a
 * person can submit, because auto-submission needs JavaScript and a browser
 * without it would otherwise watch the code expire behind a spinner.
 */
describe("OAuthCallbackForm", () => {
  function renderInForm() {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    // jsdom implements neither requestSubmit's default behaviour nor form
    // submission, so the button's `form` association is what we assert through.
    HTMLFormElement.prototype.requestSubmit = function requestSubmit(this: HTMLFormElement) {
      this.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    };
    render(
      <form onSubmit={onSubmit}>
        <OAuthCallbackForm label="Continue" />
      </form>,
    );
    return onSubmit;
  }

  it("submits the form it lives in as soon as it mounts", () => {
    const onSubmit = renderInForm();

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("submits exactly once, so a spent code cannot be redeemed twice", () => {
    const onSubmit = renderInForm();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Continue" }).hasAttribute("disabled")).toBe(true);
  });

  /**
   * The no-JS path. If this were a decorative label rather than a submit
   * control, a browser without JavaScript would render a dead page — which is
   * exactly what makes the auto-submit safe to add.
   */
  it("renders a real submit button rather than a status label", () => {
    renderInForm();

    expect(screen.getByRole("button", { name: "Continue" }).getAttribute("type")).toBe("submit");
  });
});
