// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoginPage } from "../login-page";

// This config has no global testing-library auto-cleanup, so unmount between
// tests to keep the document free of stale renders.
afterEach(() => cleanup());

const noopSignIn = vi.fn(async () => "");

function renderLogin(error?: string) {
  render(
    <LoginPage
      error={error}
      signInAction={noopSignIn}
      requestOtpAction={async () => ({})}
      otpSignInAction={async () => ({})}
      passwordSignInAction={async () => ({})}
      requestPasswordResetAction={async () => ({})}
      confirmPasswordResetAction={async () => ({})}
      abandonPasswordResetAction={async () => {}}
      changeEmailAction={async () => {}}
    />,
  );
}

describe("LoginPage error messages", () => {
  it("renders no alert when there is no error", () => {
    renderLogin(undefined);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the invitation-required message for signup_disabled", () => {
    renderLogin("signup_disabled");
    expect(screen.getByRole("alert").textContent).toContain("Ask an admin for an invitation");
  });

  it("shows the invitation-required message for AccessDenied", () => {
    renderLogin("AccessDenied");
    expect(screen.getByRole("alert").textContent).toContain("Ask an admin for an invitation");
  });

  /**
   * UX-10: someone who clicked Cancel at the provider was told their account
   * "is not provisioned" and sent to an admin. Their account is fine.
   */
  it("says a cancelled consent was cancelled, and nothing about the account", () => {
    renderLogin("consent_cancelled");
    const text = screen.getByRole("alert").textContent ?? "";
    expect(text).toContain("Sign-in was cancelled");
    expect(text).not.toMatch(/provisioned|admin|invitation/i);
  });

  it("shows the wrong-account message for email_mismatch", () => {
    renderLogin("email_mismatch");
    expect(screen.getByRole("alert").textContent).toContain("Sign in with the right account");
  });

  it("falls back to a generic message for unknown codes", () => {
    renderLogin("oauth_handoff_failed");
    expect(screen.getByRole("alert").textContent).toContain("Sign-in didn't complete");
  });
});
