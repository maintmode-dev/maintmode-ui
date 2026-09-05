// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LoginPage } from "@/features/auth/login-page";
import type { SignInMethod } from "@/domain/auth/sign-in-method";

/**
 * RUK-288 AC-1 / AC-2 / AC-11 — the login page is drawn from the backend's
 * method list, and cannot lock anyone out when that list is unavailable.
 */

afterEach(() => cleanup());

const noopSignIn = async () => {};

/** The sign-in actions are exercised in their own tests; here they are inert. */
const actions = {
  signInAction: noopSignIn,
  requestOtpAction: async () => ({}),
  otpSignInAction: async () => ({}),
  passwordSignInAction: async () => ({}),
  changeEmailAction: async () => {},
};

const PASSWORD: SignInMethod = { id: "email_password", type: "password", display_name: "Password" };
const OTP: SignInMethod = { id: "email_otp", type: "code", display_name: "Email code" };

describe("AC-1 — the method list comes from the backend, not from a literal", () => {
  it("renders every method the backend advertises", () => {
    render(<LoginPage methods={[PASSWORD, OTP]} {...actions} />);

    expect(screen.getByText("Password")).toBeDefined();
    expect(screen.getByText("Email code")).toBeDefined();
  });

  it("drops a method the backend stops advertising, with no frontend change", () => {
    // The whole point of the ticket: disabling a method on the backend must
    // remove it from this page without a release.
    render(<LoginPage methods={[PASSWORD]} {...actions} />);

    expect(screen.getByText("Password")).toBeDefined();
    expect(screen.queryByText("Email code")).toBeNull();
  });

  it("renders an empty list as empty rather than inventing a method", () => {
    render(<LoginPage methods={[]} {...actions} />);

    expect(screen.queryByText("Password")).toBeNull();
    expect(screen.queryByText("Email code")).toBeNull();
    // Google still stands: it is not part of the backend list at all.
    expect(screen.getByText("Continue with Google")).toBeDefined();
  });
});

describe("AC-2 — rendering dispatches on `type`, never on `id`", () => {
  it("renders an unfamiliar id by its type", () => {
    // The id is deliberately one this build has never seen: dispatch must key
    // off `type`, so the backend can add or rename methods without a release.
    const renamed: SignInMethod = { id: "totally_new_id", type: "code", display_name: "Email code" };
    render(<LoginPage methods={[renamed]} {...actions} />);

    expect(document.querySelector('[data-method-type="code"]')).not.toBeNull();
    // ...and it is the real OTP flow, not a placeholder.
    expect(screen.getByPlaceholderText("you@example.com")).toBeDefined();
  });

  it("renders a redirect-type method inert instead of crashing", () => {
    const sso: SignInMethod = { id: "acme-sso", type: "redirect", display_name: "Acme SSO" };
    render(<LoginPage methods={[sso]} {...actions} />);

    const button = screen.getByText("Acme SSO").closest("button");
    expect(button?.getAttribute("data-method-type")).toBe("redirect");
    expect(button?.hasAttribute("disabled")).toBe(true);
  });
});

describe("AC-11 — a broken auth service must not lock everyone out", () => {
  it("keeps Google when the providers fetch failed", () => {
    // Google is not in the backend list, so deriving the buttons purely from
    // `methods` would delete the one method that still works.
    render(<LoginPage methods={undefined} {...actions} />);

    expect(screen.getByText("Continue with Google")).toBeDefined();
  });

  it("offers the break-glass password form when the providers fetch failed", () => {
    render(<LoginPage methods={undefined} {...actions} />);

    expect(screen.getByText("Password")).toBeDefined();
  });

  it("says something is degraded, without naming a cause a user can't act on", () => {
    render(<LoginPage methods={undefined} {...actions} />);

    expect(screen.getByRole("status").textContent).toContain("may be unavailable");
  });

  it("shows no degraded notice when the list resolved normally", () => {
    render(<LoginPage methods={[PASSWORD]} {...actions} />);

    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("Google is owned by NextAuth, not by the backend list", () => {
  it("does not render Google twice if the backend ever advertises it", () => {
    const googleFromBackend: SignInMethod = {
      id: "google",
      type: "redirect",
      display_name: "Google",
    };
    render(<LoginPage methods={[googleFromBackend, PASSWORD]} {...actions} />);

    expect(screen.getAllByText(/Google/)).toHaveLength(1);
  });
});
