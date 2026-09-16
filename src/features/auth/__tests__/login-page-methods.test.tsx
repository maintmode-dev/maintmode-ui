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
  requestPasswordResetAction: async () => ({}),
  confirmPasswordResetAction: async () => ({}),
  abandonPasswordResetAction: async () => {},
};

const PASSWORD: SignInMethod = { id: "email_password", type: "password", display_name: "Password" };
const OTP: SignInMethod = { id: "email_otp", type: "code", display_name: "Email code" };

/**
 * A live Google provider as the backend now advertises it. Every login row is
 * stamped `type: "redirect"` (`providers_list.go`), so `id` is the only thing
 * that distinguishes a configured provider from an unknown method type.
 */
const GOOGLE: SignInMethod = { id: "google", type: "redirect", display_name: "Google" };

describe("AC-1 — the method list comes from the backend, not from a literal", () => {
  it("renders every method the backend advertises", () => {
    render(<LoginPage methods={[PASSWORD, OTP]} {...actions} />);

    // Asserted by rendered component, not by label text: both forms render
    // `display_name` as their label, so matching text alone would pass even if
    // a `password` method rendered the OTP flow.
    expect(document.querySelector('[data-method-type="password"]')).not.toBeNull();
    expect(document.querySelector('[data-method-type="code"]')).not.toBeNull();
    expect(document.querySelector('input[type="password"]')).not.toBeNull();
  });

  it("drops a method the backend stops advertising, with no frontend change", () => {
    // The whole point of the ticket: disabling a method on the backend must
    // remove it from this page without a release.
    render(<LoginPage methods={[PASSWORD]} {...actions} />);

    expect(document.querySelector('[data-method-type="password"]')).not.toBeNull();
    expect(document.querySelector('[data-method-type="code"]')).toBeNull();
    expect(screen.queryByText("Email code")).toBeNull();
  });

  it("renders an empty list as empty rather than inventing a method", () => {
    render(<LoginPage methods={[]} {...actions} />);

    expect(screen.queryByText("Password")).toBeNull();
    expect(screen.queryByText("Email code")).toBeNull();
  });
});

/**
 * RUK-304. `b74a4536` moved sign-in providers into the integration registry,
 * so Google IS in the backend's list now — and after the migration that
 * deleted the old rows, a fresh deployment has no such row at all.
 *
 * Rendering the button unconditionally therefore sends the user to
 * `startOAuthDanceAction`, which `redirect()`s; the backend answers an unknown
 * provider with a JSON error rather than a redirect, deliberately, since it has
 * no trusted frontend address at that point. The result is raw JSON on another
 * origin with only the back button to escape.
 */
describe("RUK-304 — a provider button only for a provider that exists", () => {
  it("renders Google when the backend advertises it", () => {
    render(<LoginPage methods={[PASSWORD, GOOGLE]} {...actions} />);

    expect(screen.getByText("Continue with Google")).toBeDefined();
  });

  it("does NOT render Google when the backend does not advertise it", () => {
    render(<LoginPage methods={[PASSWORD]} {...actions} />);

    // A button that navigates to raw backend JSON is worse than no button.
    expect(screen.queryByText("Continue with Google")).toBeNull();
  });

  it("renders no provider button at all for an empty list", () => {
    render(<LoginPage methods={[]} {...actions} />);

    expect(screen.queryByText("Continue with Google")).toBeNull();
  });

  /**
   * `OAUTH_IDS` subtracts the branded ids from the generic list. Without that,
   * an advertised Google appears twice — once branded, once as a disabled
   * `redirect` placeholder.
   */
  it("renders an advertised Google exactly once", () => {
    render(<LoginPage methods={[GOOGLE]} {...actions} />);

    expect(screen.queryAllByText("Continue with Google")).toHaveLength(1);
    expect(screen.queryByText("Google")).toBeNull();
  });

  /**
   * GitHub sign-in is not wired up on this frontend, so an advertised row must
   * not become a live button. Enabling it is RUK-302's work; until then the
   * placeholder is the honest answer.
   */
  it("keeps GitHub a disabled placeholder even if the backend advertises it", () => {
    const github: SignInMethod = { id: "github", type: "redirect", display_name: "GitHub" };
    render(<LoginPage methods={[github]} {...actions} />);

    const button = screen.getByText("Continue with GitHub").closest("button");
    expect(button?.hasAttribute("disabled")).toBe(true);
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
  /**
   * The distinction that survives RUK-304: an EMPTY list is an answer (nothing
   * is configured), a FAILED fetch is not an answer at all. Suppressing the
   * button on a transport failure would remove a working method because the
   * list could not be read — so the unconditional render is kept for exactly
   * this case, and only this case.
   */
  it("keeps Google when the providers fetch failed", () => {
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
