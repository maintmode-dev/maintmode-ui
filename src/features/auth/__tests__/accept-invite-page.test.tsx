// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AcceptInvitePage, type InvitationPreviewResult } from "../accept-invite-page";

// This config has no global testing-library auto-cleanup, so unmount between
// tests to keep the document free of stale renders.
afterEach(() => cleanup());

const noopAccept = vi.fn(async () => {});

function renderPage(
  preview: InvitationPreviewResult,
  token?: string,
  extra: { signedInAs?: string; signInAvailable?: boolean } = {},
) {
  render(<AcceptInvitePage token={token} preview={preview} acceptAction={noopAccept} {...extra} />);
}

describe("AcceptInvitePage token states", () => {
  it("renders the sign-in affordance for a valid invite", () => {
    renderPage({ status: "valid" }, "tok-1");

    expect(screen.getByRole("heading").textContent).toContain("You've been invited");
    expect(screen.getByRole("button", { name: /Continue with Google/ })).toBeTruthy();
  });

  it("renders the invalid copy for an unknown token, with no sign-in affordance", () => {
    renderPage({ status: "invalid" }, "tok-unknown");

    expect(screen.getByText("Invalid invitation link")).toBeTruthy();
    // The whole point of the invalid state: never offer to sign in.
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Go to login" })).toBeTruthy();
  });

  it("renders the incomplete-link copy when the URL carries no token", () => {
    renderPage({ status: "missing" }, undefined);

    expect(screen.getByText("Invitation link is incomplete")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
  });

  it.each([
    ["expired", "This invitation has expired"],
    ["accepted", "This invitation has already been claimed"],
    ["revoked", "This invitation has been revoked"],
  ] as const)("renders the terminal copy for %s", (status, title) => {
    renderPage({ status }, "tok-1");

    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
  });

  it("offers a token-preserving retry link when the preview could not be verified", () => {
    renderPage({ status: "unknown_error" }, "tok abc&x");

    const retry = screen.getByRole("link", { name: /Try again/ });
    // Retrying must re-request THIS invite, and the token must survive encoding.
    expect(retry.getAttribute("href")).toBe("/accept-invite?token=tok%20abc%26x");
  });

  it("falls back to Go to login on an unverifiable preview with no token to retry", () => {
    renderPage({ status: "unknown_error" }, undefined);

    expect(screen.queryByRole("link", { name: /Try again/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Go to login" })).toBeTruthy();
  });

  it("never renders email, roles, or inviter even if the server widened the payload", () => {
    const leaky = {
      status: "valid",
      suggested_provider: "google",
      email: "victim@corp.test",
      roles: ["admin"],
    } as unknown as InvitationPreviewResult;

    renderPage(leaky, "tok-1");

    expect(document.body.textContent).not.toContain("victim@corp.test");
    expect(document.body.textContent).not.toContain("admin");
  });

  it("treats an unrecognized suggested_provider as the Google default", () => {
    renderPage({ status: "valid", suggested_provider: "saml-corp" }, "tok-1");

    expect(screen.getByRole("button", { name: /Continue with Google/ })).toBeTruthy();
  });

  /**
   * The button is live again: accepting is now the ordinary dance with the
   * invitation riding along (the backend resolves it before creating the user).
   * A real `<form>`, not an `onClick`, so the flow degrades without JavaScript
   * like every other sign-in path here.
   */
  it("submits the accept action through a form", () => {
    renderPage({ status: "valid" }, "tok-1");

    const button = screen.getByRole("button", { name: /Continue with Google/ });
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(button.getAttribute("type")).toBe("submit");
    expect(button.closest("form")).toBeTruthy();
    // Asserted on the ANONYMOUS render, not only on the signed-in one: with the
    // guard inverted, each render still satisfies one half of the pair — the
    // form appears for the signed-in visitor and the caption for everyone else.
    // Only checking that this render has no caption catches the swap.
    expect(screen.queryByText(/signed in as/i)).toBeNull();
  });

  it("no longer says acceptance is unavailable", () => {
    renderPage({ status: "valid" }, "tok-1");

    expect(screen.queryByText(/temporarily unavailable/)).toBeNull();
    expect(screen.queryByText(/Other providers are coming soon/)).toBeNull();
  });

  /**
   * A signed-in visitor must not be able to click.
   *
   * Not cosmetic: the backend claims the invitation in phase 2, inside the
   * dance, so a click would spend it and the next visitor would read "already
   * claimed". An admin opening the link to check it is how that happens.
   */
  it("offers no accept button to a signed-in visitor", () => {
    renderPage({ status: "valid" }, "tok-1", { signedInAs: "admin@corp.test" });

    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
    expect(screen.getByText(/signed in as admin@corp.test/i)).toBeTruthy();
    // The instruction, not just the diagnosis. This caption is the ENTIRE
    // recovery path for someone who would otherwise burn the invitation, so
    // truncating it to "you are signed in as X" leaves them blocked with
    // nothing to do — and the name-only assertion above would still pass.
    expect(screen.getByText(/sign out first/i)).toBeTruthy();
  });
});

/**
 * RUK-304. `b74a4536` moved sign-in providers into the registry and its
 * migration deleted the existing rows, so a fresh deployment has no Google
 * provider. This page hard-coded one and handed it to a server action that
 * `redirect()`s, and the backend answers an unknown provider with a JSON error
 * rather than a redirect — so the invitee landed on raw JSON on another origin.
 *
 * The provider is resolved on the server now and its availability arrives as a
 * prop. It DEFAULTS to available, which keeps the existing assertion above —
 * that a valid invite does not say "temporarily unavailable" — passing
 * untouched.
 */
describe("RUK-304 — no button for a provider that is not there", () => {
  it("offers the button when sign-in is available", () => {
    renderPage({ status: "valid" }, "tok-1", { signInAvailable: true });

    expect(screen.getByRole("button", { name: /Continue with Google/ })).toBeTruthy();
  });

  it("offers the button when availability is not stated, so today's callers are unaffected", () => {
    renderPage({ status: "valid" }, "tok-1");

    expect(screen.getByRole("button", { name: /Continue with Google/ })).toBeTruthy();
  });

  it("offers NO button when no sign-in provider is configured", () => {
    renderPage({ status: "valid" }, "tok-1", { signInAvailable: false });

    // A button that navigates to raw backend JSON is worse than no button.
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
  });

  /**
   * The invitation is NOT consumed on this path — the backend refuses before
   * minting any state — so the link still works later. Someone who sees an
   * explanation with no button will otherwise assume they burnt their invite.
   */
  it("says the invitation is still valid, so the invitee does not think it was spent", () => {
    renderPage({ status: "valid" }, "tok-1", { signInAvailable: false });

    const status = screen.getByRole("status").textContent ?? "";
    expect(status).toMatch(/still (valid|works)/i);
  });

  it("explains that sign-in is unavailable rather than leaving the page mute", () => {
    renderPage({ status: "valid" }, "tok-1", { signInAvailable: false });

    expect(screen.getByRole("status").textContent).toMatch(/sign[- ]in/i);
  });

  /**
   * An invalid invite must not gain a new way to say something: the absence of
   * a provider is irrelevant when the token itself is no good.
   */
  it("still shows the invalid copy when the token is bad and no provider exists", () => {
    renderPage({ status: "invalid" }, "tok-bad", { signInAvailable: false });

    expect(screen.getByText("Invalid invitation link")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
  });
});
