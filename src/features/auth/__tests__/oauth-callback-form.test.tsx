// @vitest-environment jsdom
import { StrictMode } from "react";
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
    const tree = (
      <form onSubmit={onSubmit}>
        <OAuthCallbackForm label="Continue" />
      </form>
    );
    const view = render(tree);
    return { onSubmit, rerender: () => view.rerender(tree) };
  }

  it("submits the form it lives in as soon as it mounts", () => {
    const { onSubmit } = renderInForm();

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  /**
   * What the guard actually defends, stated precisely because an earlier version
   * of this test claimed more than it checked.
   *
   * The effect's dependency list is empty, so an ordinary re-render never runs
   * it twice — a "called once after re-render" assertion passes whether or not
   * the guard exists. The case the ref DOES cover is React's StrictMode, which
   * double-invokes effects in development (`reactStrictMode: true` in
   * `next.config.ts`), and that is what this reproduces.
   *
   * It does not cover a genuine remount: a new mount builds a new ref, and
   * nothing in the component could prevent that. The reload-with-a-spent-code
   * path is handled server-side instead — `oauth-dance-complete.test.ts` pins it
   * landing on the error branch rather than on a second redemption.
   */
  it("submits once under StrictMode's double-invoked effect", () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    HTMLFormElement.prototype.requestSubmit = function requestSubmit(this: HTMLFormElement) {
      this.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    };

    render(
      <StrictMode>
        <form onSubmit={onSubmit}>
          <OAuthCallbackForm label="Continue" />
        </form>
      </StrictMode>,
    );

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
