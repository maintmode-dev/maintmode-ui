// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { LoginPage } from "@/features/auth/login-page";
import type { SignInMethod } from "@/domain/auth/sign-in-method";

// jsdom implements no ResizeObserver, and Radix's Checkbox measures itself via
// `useSize`. Without this every test in the file dies on render rather than on
// an assertion. Inline rather than a shared helper: `src/features/**` may not
// import `@/shared/testing/**` (eslint no-restricted-imports), and that
// boundary is worth more than deduplicating six lines. Same stub as
// `src/features/settings/__tests__/timezone-card.test.tsx`.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

afterEach(() => cleanup());

const PASSWORD_METHOD: SignInMethod = {
  id: "email_password",
  type: "password",
  display_name: "Password",
};
const CODE_METHOD: SignInMethod = { id: "email_otp", type: "code", display_name: "Email code" };

function renderLogin(
  overrides: Partial<React.ComponentProps<typeof LoginPage>> = {},
): React.ComponentProps<typeof LoginPage> {
  const props: React.ComponentProps<typeof LoginPage> = {
    methods: [PASSWORD_METHOD],
    signInAction: vi.fn(async () => {}),
    requestOtpAction: vi.fn(async () => ({})),
    otpSignInAction: vi.fn(async () => ({})),
    passwordSignInAction: vi.fn(async () => ({})),
    changeEmailAction: vi.fn(async () => {}),
    requestPasswordResetAction: vi.fn(async () => ({})),
    confirmPasswordResetAction: vi.fn(async () => ({ done: true })),
    abandonPasswordResetAction: vi.fn(async () => {}),
    ...overrides,
  };
  render(<LoginPage {...props} />);
  return props;
}

describe("the entry point into the reset flow", () => {
  // Without this the feature has no way in and nothing else would fail.
  it("offers 'Forgot password?' beside the password form", () => {
    renderLogin();

    expect(screen.getByRole("button", { name: "Forgot password?" })).toBeTruthy();
  });

  it("opens the reset flow when it is clicked", () => {
    renderLogin();
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));

    expect(screen.getByLabelText("Reset your password")).toBeTruthy();
    // The sign-in form is gone: the page shows one thing to do at a time.
    expect(screen.queryByLabelText("Email")).toBeNull();
  });

  // The affordance belongs to the password form, so an instance advertising
  // only emailed codes must not offer to reset a password it does not accept.
  it("offers nothing when the backend advertises no password method", () => {
    renderLogin({ methods: [CODE_METHOD] });

    expect(screen.queryByRole("button", { name: "Forgot password?" })).toBeNull();
  });
});

describe("rehydration after a reload", () => {
  // A reset spans an email round-trip, so the user leaves the tab. Without this
  // they come back to step one and silently lose the code they were sent.
  it("resumes at step two when the server hands down a live binding", () => {
    renderLogin({ resetInProgressEmail: "op@example.test" });

    expect(screen.getByLabelText("Enter the 6-digit code")).toBeTruthy();
    expect(screen.getByText(/Sent to op@example.test/)).toBeTruthy();
  });

  // SPEC §2.1: the advertised method list is the authority on what the page
  // offers. A cookie must not resurrect a method an operator has switched off.
  it("ignores a live binding when password sign-in is no longer offered", () => {
    renderLogin({ resetInProgressEmail: "op@example.test", methods: [CODE_METHOD] });

    expect(screen.queryByLabelText("Enter the 6-digit code")).toBeNull();
    expect(screen.getByLabelText("Email code")).toBeTruthy();
  });

  it("starts at step one when there is no binding", () => {
    renderLogin();
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));

    expect(screen.getByLabelText("Reset your password")).toBeTruthy();
  });
});

describe("what the user is told afterwards", () => {
  // The backend has revoked every session and returned no tokens, so there is
  // nothing to sign into — the confirmation is the entire outcome. SPEC §2.1
  // names shipping without it as the failure to avoid.
  it("confirms the change and returns to the sign-in form", async () => {
    renderLogin({ resetInProgressEmail: "op@example.test" });

    fireEvent.change(screen.getByLabelText("Enter the 6-digit code"), {
      target: { value: "123456" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "a-long-enough-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toMatch(/password updated/i);
    });
    // Back on the sign-in form, which is where the new password is used.
    expect(screen.getByLabelText("Password")).toBeTruthy();
  });

  it("returns to sign-in without a confirmation when the user backs out", () => {
    renderLogin();
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));

    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
