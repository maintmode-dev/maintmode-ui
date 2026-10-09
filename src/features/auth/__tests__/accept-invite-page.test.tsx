// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AcceptInvitePage, type InvitationPreviewResult } from "../accept-invite-page";
import type { SignInMethod } from "@/domain/auth/sign-in-method";

// This config has no global testing-library auto-cleanup, so unmount between
// tests to keep the document free of stale renders.
afterEach(() => cleanup());

const noopAccept = vi.fn<(providerId: string) => Promise<string>>(async () => "");

const GOOGLE: SignInMethod = { id: "google", type: "redirect", display_name: "Google" };
const CUSTOM: SignInMethod = { id: "custom", type: "redirect", display_name: "Corporate SSO" };

function renderPage(
  preview: InvitationPreviewResult,
  token?: string,
  extra: {
    signedInAs?: string;
    providers?: SignInMethod[];
    acceptAction?: (providerId: string) => Promise<string>;
    passwordOffered?: boolean;
    passwordAcceptAction?: (password: string) => Promise<{ error?: string }>;
  } = {},
) {
  const {
    providers = [GOOGLE],
    acceptAction = noopAccept,
    passwordOffered = false,
    passwordAcceptAction = async () => ({}),
    ...rest
  } = extra;
  render(
    <AcceptInvitePage
      token={token}
      preview={preview}
      acceptAction={acceptAction}
      providers={providers}
      passwordOffered={passwordOffered}
      passwordAcceptAction={passwordAcceptAction}
      {...rest}
    />,
  );
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

  it("draws its buttons from the advertised providers, never from suggested_provider", () => {
    // The backend's hint names a provider that is not configured here; the
    // button must come from what is, or it would start a dance for nothing.
    renderPage({ status: "valid", suggested_provider: "google" }, "tok-1", { providers: [CUSTOM] });

    expect(screen.getByRole("button", { name: "Continue with Corporate SSO" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Continue with Google/ })).toBeNull();
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
 * migration deleted the existing rows, so a fresh deployment may have none. The
 * page hard-coded Google and handed it to a server action that `redirect()`s,
 * and the backend answers an unknown provider with a JSON error rather than a
 * redirect — so the invitee landed on raw JSON on another origin.
 *
 * The providers are resolved on the server now and arrive as a prop.
 */
describe("RUK-304 — no button for a provider that is not there", () => {
  it("offers a button for the provider it is given", () => {
    renderPage({ status: "valid" }, "tok-1", { providers: [GOOGLE] });

    expect(screen.getByRole("button", { name: /Continue with Google/ })).toBeTruthy();
  });

  it("offers NO button when no sign-in provider is configured", () => {
    renderPage({ status: "valid" }, "tok-1", { providers: [] });

    // A button that navigates to raw backend JSON is worse than no button.
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
  });

  /**
   * The invitation is NOT consumed on this path — the backend refuses before
   * minting any state — so the link still works later. Someone who sees an
   * explanation with no button will otherwise assume they burnt their invite.
   */
  it("says the invitation is still valid, so the invitee does not think it was spent", () => {
    renderPage({ status: "valid" }, "tok-1", { providers: [] });

    const status = screen.getByRole("status").textContent ?? "";
    expect(status).toMatch(/still (valid|works)/i);
  });

  it("explains that sign-in is unavailable rather than leaving the page mute", () => {
    renderPage({ status: "valid" }, "tok-1", { providers: [] });

    expect(screen.getByRole("status").textContent).toMatch(/sign[- ]in/i);
  });

  /**
   * An invalid invite must not gain a new way to say something: the absence of
   * a provider is irrelevant when the token itself is no good.
   */
  it("still shows the invalid copy when the token is bad and no provider exists", () => {
    renderPage({ status: "invalid" }, "tok-bad", { providers: [] });

    expect(screen.getByText("Invalid invitation link")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
  });
});

/**
 * BUG-4. With Google switched off and a `custom` OIDC provider live, this page
 * said "Sign-in isn't set up on this instance yet" — false, and for an
 * organisation whose only way in is its own IdP, the end of onboarding.
 */
describe("BUG-4 — an invitation can be accepted through any advertised provider", () => {
  it("offers a custom provider by its display name", () => {
    renderPage({ status: "valid" }, "tok-1", { providers: [CUSTOM] });

    const button = screen.getByRole("button", { name: "Continue with Corporate SSO" });
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("offers one button per provider", () => {
    renderPage({ status: "valid" }, "tok-1", { providers: [GOOGLE, CUSTOM] });

    expect(screen.getAllByRole("button", { name: /^Continue with/ })).toHaveLength(2);
  });

  it("starts the dance for the provider that was clicked", async () => {
    // Two providers, so a button wired to the other one — or to a literal —
    // cannot pass by coincidence.
    const START = "http://localhost:9000/auth/api/v1/login/oauth/custom/start?binding=B&invitation=tok-1";
    const acceptAction = vi.fn<(providerId: string) => Promise<string>>(async () => START);
    const assign = vi.fn();
    const originalLocation = window.location;
    // jsdom's `window.location` is sealed; replace the property to spy on
    // `.assign()`, as `organization-suspended-page.test.tsx` does.
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...originalLocation, assign } as unknown as Location,
    });
    try {
      renderPage({ status: "valid" }, "tok-1", { providers: [GOOGLE, CUSTOM], acceptAction });

      fireEvent.click(screen.getByRole("button", { name: "Continue with Corporate SSO" }));

      await waitFor(() => expect(acceptAction).toHaveBeenCalledTimes(1));
      expect(acceptAction.mock.calls[0]?.[0]).toBe("custom");
      // A FULL navigation to the URL the action answered, not the action's own
      // `redirect()`: on a same-origin auth base Next soft-navigates that and
      // `/start` is never requested — the invite button did nothing.
      await waitFor(() => expect(assign).toHaveBeenCalledWith(START));
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: originalLocation,
      });
    }
  });

  it("still offers nothing to a signed-in visitor, whatever is configured", () => {
    renderPage({ status: "valid" }, "tok-1", { providers: [GOOGLE, CUSTOM], signedInAs: "a@corp.test" });

    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
  });
});

/**
 * Accepting an invitation by setting a password — for an organisation with no
 * identity provider, or an invitee who would rather not use one.
 */
describe("accepting with a password", () => {
  const passwordField = () => screen.getByLabelText("Create a password");
  const accept = () => screen.getByRole("button", { name: "Accept invitation" });

  it("offers the password form alongside the providers when password sign-in is on", () => {
    renderPage({ status: "valid" }, "tok-1", { passwordOffered: true });

    expect(screen.getByRole("button", { name: /Continue with Google/ })).toBeTruthy();
    expect(passwordField().getAttribute("autocomplete")).toBe("new-password");
    expect(screen.getByText("At least 12 characters.")).toBeTruthy();
  });

  it("offers the form on its own, instead of 'not set up', when no provider exists", () => {
    renderPage({ status: "valid" }, "tok-1", { providers: [], passwordOffered: true });

    expect(passwordField()).toBeTruthy();
    expect(screen.queryByText(/isn't set up/)).toBeNull();
    expect(screen.getByText("Set a password to accept this invitation.")).toBeTruthy();
  });

  it("offers no form when password sign-in is off", () => {
    renderPage({ status: "valid" }, "tok-1", { passwordOffered: false });

    expect(screen.queryByLabelText("Create a password")).toBeNull();
  });

  it("offers no form to a signed-in visitor", () => {
    renderPage({ status: "valid" }, "tok-1", { passwordOffered: true, signedInAs: "admin@example.test" });

    expect(screen.queryByLabelText("Create a password")).toBeNull();
  });

  it("offers no form on an unusable invitation", () => {
    renderPage({ status: "expired" }, "tok-1", { passwordOffered: true });

    expect(screen.queryByLabelText("Create a password")).toBeNull();
  });

  it("sends only the password — the token is the server's", async () => {
    const submit = vi.fn(async () => ({}));
    renderPage({ status: "valid" }, "tok-1", { passwordOffered: true, passwordAcceptAction: submit });

    fireEvent.change(passwordField(), { target: { value: "correct horse battery" } });
    fireEvent.click(accept());

    await waitFor(() => expect(submit).toHaveBeenCalledWith("correct horse battery"));
  });

  it("answers a short password without sending it", async () => {
    const submit = vi.fn(async () => ({}));
    renderPage({ status: "valid" }, "tok-1", { passwordOffered: true, passwordAcceptAction: submit });

    fireEvent.change(passwordField(), { target: { value: "short" } });
    fireEvent.click(accept());

    expect((await screen.findByRole("alert")).textContent).toBe("Use at least 12 characters.");
    expect(submit).not.toHaveBeenCalled();
  });

  it.each([
    ["invitation_invalid", /can no longer be used/],
    ["method_disabled", /Password sign-in is turned off/],
    ["seats_limit_exceeded", /no free seats/],
    [
      "account_exists",
      /already exists — sign in\. If you need the access this invitation gives, ask an administrator/,
    ],
    ["invite_rate_limited", /Too many attempts/],
    ["identity_lookup_failed", /account is ready/],
    ["invite_accept_failed", /Something went wrong/],
  ])("words %s on its own", async (code, text) => {
    renderPage({ status: "valid" }, "tok-1", {
      passwordOffered: true,
      passwordAcceptAction: async () => ({ error: code }),
    });

    fireEvent.change(passwordField(), { target: { value: "correct horse battery" } });
    fireEvent.click(accept());

    expect((await screen.findByRole("alert")).textContent).toMatch(text);
  });

  it("points an existing account at sign-in", async () => {
    renderPage({ status: "valid" }, "tok-1", {
      passwordOffered: true,
      passwordAcceptAction: async () => ({ error: "account_exists" }),
    });

    fireEvent.change(passwordField(), { target: { value: "correct horse battery" } });
    fireEvent.click(accept());

    const link = await screen.findByRole("link", { name: "Go to sign-in" });
    expect(link.getAttribute("href")).toBe("/login");
  });

  /** A successful accept redirects, and Next rejects the action while it navigates. */
  it("shows no error while a successful accept navigates away", async () => {
    const { redirect } = await import("next/navigation");
    let redirectError: unknown;
    try {
      redirect("/");
    } catch (error) {
      redirectError = error;
    }
    renderPage({ status: "valid" }, "tok-1", {
      passwordOffered: true,
      passwordAcceptAction: async () => Promise.reject(redirectError),
    });

    fireEvent.change(passwordField(), { target: { value: "correct horse battery" } });
    fireEvent.click(accept());

    await screen.findByRole("button", { name: "Accepting…" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
