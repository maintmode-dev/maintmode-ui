// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
 * Providers as the backend advertises them: every login row in the integration
 * registry is stamped `type: "redirect"`. An unknown wire type never arrives as
 * `redirect` — the resolver maps it to `unsupported` — so `redirect` means a
 * provider this page must draw as a working button.
 */
const GOOGLE: SignInMethod = { id: "google", type: "redirect", display_name: "Google" };
const CUSTOM: SignInMethod = { id: "custom", type: "redirect", display_name: "Corporate SSO" };
const GITHUB: SignInMethod = { id: "github", type: "redirect", display_name: "GitHub" };

const providerButton = (name: string) => screen.getByRole("button", { name: `Continue with ${name}` });

describe("AC-1 — the method list comes from the backend, not from a literal", () => {
  it("renders every method the backend advertises, one form at a time", () => {
    render(<LoginPage methods={[PASSWORD, OTP]} {...actions} />);

    // Asserted by rendered component, not by label text: both forms render
    // `display_name` as their label, so matching text alone would pass even if
    // a `password` method rendered the OTP flow.
    expect(document.querySelector('[data-method-type="password"]')).not.toBeNull();
    expect(document.querySelector('input[type="password"]')).not.toBeNull();
    // Both start from an email address: drawing them together put two Email
    // fields and two "Sign in" buttons on one screen (UX-1).
    expect(document.querySelector('[data-method-type="code"]')).toBeNull();
    expect(screen.getAllByRole("button", { name: "Sign in" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Email me a code instead" }));

    expect(document.querySelector('[data-method-type="code"]')).not.toBeNull();
    expect(document.querySelector('[data-method-type="password"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sign in with a password instead" }));
    expect(document.querySelector('[data-method-type="password"]')).not.toBeNull();
  });

  it("shows the form the backend lists first", () => {
    render(<LoginPage methods={[OTP, PASSWORD]} {...actions} />);

    expect(document.querySelector('[data-method-type="code"]')).not.toBeNull();
    expect(document.querySelector('[data-method-type="password"]')).toBeNull();
  });

  it("offers no switch when only one form is advertised", () => {
    render(<LoginPage methods={[OTP]} {...actions} />);

    expect(screen.queryByRole("button", { name: /instead/ })).toBeNull();
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

  it("renders an advertised provider exactly once", () => {
    render(<LoginPage methods={[GOOGLE]} {...actions} />);

    expect(screen.queryAllByText("Continue with Google")).toHaveLength(1);
  });
});

/**
 * BUG-4. The page used to know providers by id — Google live, GitHub a
 * permanent placeholder, everything else a disabled "coming soon" row — so an
 * operator who configured a `custom` OIDC provider got a button nobody could
 * press, on an instance where that provider was the only way in.
 */
describe("BUG-4 — every advertised provider is a working button", () => {
  it("draws a custom provider by its display name, enabled", () => {
    render(<LoginPage methods={[CUSTOM, PASSWORD]} {...actions} />);

    const button = providerButton("Corporate SSO");
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(button.getAttribute("type")).toBe("submit");
  });

  it("starts the dance for the provider that was clicked", async () => {
    // Two providers, so a button wired to the wrong one — or to a literal —
    // cannot pass by coincidence.
    const signInAction = vi.fn<(providerId: string) => Promise<void>>(async () => {});
    render(<LoginPage methods={[GOOGLE, CUSTOM]} {...actions} signInAction={signInAction} />);

    fireEvent.click(providerButton("Corporate SSO"));

    await waitFor(() => expect(signInAction).toHaveBeenCalledTimes(1));
    expect(signInAction.mock.calls[0]?.[0]).toBe("custom");
  });

  it("draws an advertised GitHub as a working button", () => {
    render(<LoginPage methods={[GITHUB]} {...actions} />);

    expect(providerButton("GitHub").hasAttribute("disabled")).toBe(false);
  });

  it("draws no GitHub when the backend does not advertise it", () => {
    render(<LoginPage methods={[PASSWORD]} {...actions} />);

    expect(screen.queryByText(/GitHub/)).toBeNull();
  });

  it("keeps a long display name inside the button and in its title", () => {
    const long: SignInMethod = { id: "custom", type: "redirect", display_name: "A".repeat(80) };
    render(<LoginPage methods={[long]} {...actions} />);

    const button = providerButton("A".repeat(80));
    // UX-6: the label wraps and clamps at two lines; the full text stays
    // reachable through `title`.
    expect(button.getAttribute("title")).toBe(`Continue with ${"A".repeat(80)}`);
    expect(button.querySelector(".line-clamp-2")?.textContent?.trim()).toBe(
      `Continue with ${"A".repeat(80)}`,
    );
  });
});

/**
 * The Linear-style entry (supersedes UX-1's divider): providers and "Continue
 * with email" on the first screen, the email forms one click behind it. Still
 * one thing at a time — the providers and a form are never drawn together.
 */
describe("the 'Continue with email' step", () => {
  const continueWithEmail = () => screen.getByRole("button", { name: "Continue with email" });

  it("starts on the providers and 'Continue with email', with no form mounted", () => {
    render(<LoginPage methods={[PASSWORD, GOOGLE]} {...actions} />);

    expect(providerButton("Google")).toBeDefined();
    expect(continueWithEmail()).toBeDefined();
    // Not hidden — absent. A password field kept in the DOM behind the step
    // would be autofilled by password managers on a screen nobody can see.
    expect(document.querySelector('[data-method-type="password"]')).toBeNull();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it("draws the providers before 'Continue with email', whatever the backend order", () => {
    render(<LoginPage methods={[PASSWORD, GOOGLE]} {...actions} />);

    const order = providerButton("Google").compareDocumentPosition(continueWithEmail());
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("fills only the first provider; the other ways in are outline", () => {
    render(<LoginPage methods={[CUSTOM, GOOGLE, PASSWORD]} {...actions} />);

    expect(providerButton("Corporate SSO").getAttribute("data-variant")).toBe("default");
    expect(providerButton("Google").getAttribute("data-variant")).toBe("outline");
    expect(continueWithEmail().getAttribute("data-variant")).toBe("outline");
  });

  it("opens the form on click, hides the providers, and focuses the email field", () => {
    render(<LoginPage methods={[GOOGLE, PASSWORD]} {...actions} />);

    fireEvent.click(continueWithEmail());

    expect(document.querySelector('[data-method-type="password"]')).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Continue with/ })).toBeNull();
    const email = screen.getByLabelText("Email");
    expect(document.activeElement).toBe(email);
    // What password managers key on — the step must not lose it.
    expect(email.getAttribute("autocomplete")).toBe("username");
    expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("current-password");
  });

  it("opens the emailed-code form when that is what the backend lists first", () => {
    render(<LoginPage methods={[GOOGLE, OTP, PASSWORD]} {...actions} />);

    fireEvent.click(continueWithEmail());

    expect(document.querySelector('[data-method-type="code"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Sign in with a password instead" })).toBeDefined();
  });

  it("goes back to the first screen and returns focus to 'Continue with email'", () => {
    render(<LoginPage methods={[GOOGLE, PASSWORD]} {...actions} />);
    fireEvent.click(continueWithEmail());

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(document.querySelector('[data-method-type="password"]')).toBeNull();
    expect(providerButton("Google")).toBeDefined();
    expect(document.activeElement).toBe(continueWithEmail());
  });

  it("does not focus anything on first render", () => {
    render(<LoginPage methods={[PASSWORD]} {...actions} />);

    expect(document.activeElement).toBe(document.body);
  });

  it("skips the step when there is no provider — the form is the page", () => {
    render(<LoginPage methods={[PASSWORD]} {...actions} />);

    expect(document.querySelector('[data-method-type="password"]')).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Continue with email" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("offers no step when there is no email form, only providers", () => {
    render(<LoginPage methods={[GOOGLE]} {...actions} />);

    expect(providerButton("Google")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Continue with email" })).toBeNull();
  });

  it.each(["invalid_credentials", "otp_verification_failed", "password_reset_failed"])(
    "opens on the email step for a form error (%s)",
    (code) => {
      render(<LoginPage methods={[GOOGLE, PASSWORD]} error={code} {...actions} />);

      expect(screen.getByRole("alert")).toBeDefined();
      expect(document.querySelector('[data-method-type="password"]')).not.toBeNull();
      expect(screen.getByRole("button", { name: "Back" })).toBeDefined();
    },
  );

  it.each(["consent_cancelled", "signup_disabled", "AccessDenied", "email_mismatch", "CredentialsSignin"])(
    "stays on the first screen for a provider or ambiguous error (%s)",
    (code) => {
      render(<LoginPage methods={[GOOGLE, PASSWORD]} error={code} {...actions} />);

      expect(screen.getByRole("alert")).toBeDefined();
      expect(providerButton("Google")).toBeDefined();
      expect(document.querySelector('[data-method-type="password"]')).toBeNull();
    },
  );

  it("keeps an unsupported method on the first screen, beside the other ways in", () => {
    const future: SignInMethod = { id: "passkey", type: "unsupported", display_name: "Passkey" };
    render(<LoginPage methods={[GOOGLE, PASSWORD, future]} {...actions} />);

    expect(screen.getByText("Passkey").closest("button")?.hasAttribute("disabled")).toBe(true);
    fireEvent.click(continueWithEmail());
    expect(screen.queryByText("Passkey")).toBeNull();
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

  it("renders a method of an unsupported type inert instead of crashing", () => {
    // What the resolver makes of a wire type this build does not know. It must
    // stay visible and disabled — never a "Continue with …" provider button.
    const future: SignInMethod = { id: "passkey", type: "unsupported", display_name: "Passkey" };
    render(<LoginPage methods={[future]} {...actions} />);

    const button = screen.getByText("Passkey").closest("button");
    expect(button?.getAttribute("data-method-type")).toBe("unsupported");
    expect(button?.hasAttribute("disabled")).toBe(true);
    expect(screen.queryByText(/Continue with/)).toBeNull();
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

  it("offers only Google then — a list it could not read names no other provider", () => {
    render(<LoginPage methods={undefined} {...actions} />);

    expect(document.querySelectorAll("[data-provider-id]")).toHaveLength(1);
    expect(document.querySelector('[data-provider-id="google"]')).not.toBeNull();
  });

  it("offers the break-glass password form when the providers fetch failed", () => {
    render(<LoginPage methods={undefined} {...actions} />);

    // Behind the email step, like any password form beside a provider — but
    // there, one click away.
    fireEvent.click(screen.getByRole("button", { name: "Continue with email" }));
    expect(screen.getByText("Password")).toBeDefined();
    expect(document.querySelector('input[type="password"]')).not.toBeNull();
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
