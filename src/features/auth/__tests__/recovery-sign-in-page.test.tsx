// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SignInMethod } from "@/domain/auth/sign-in-method";
import { LoginPage } from "@/features/auth/login-page";
import { RecoverySignInPage } from "@/features/auth/recovery-sign-in-page";

/**
 * `/login/recovery`: the break-glass administrator's way in once `/login`
 * offers them nothing. An admin who switched off every built-in method with no
 * linked provider found no password form anywhere — the backend still accepted
 * break-glass, the screen did not offer it.
 */

afterEach(() => cleanup());

const passwordField = () => screen.getByLabelText("Break-glass password");

describe("RecoverySignInPage", () => {
  it("offers a password field and nothing else — no email, no reset, no providers", () => {
    render(<RecoverySignInPage breakGlassSignInAction={async () => ({})} />);

    expect(screen.getByRole("heading", { name: "Administrator sign-in" })).toBeTruthy();
    expect(passwordField().getAttribute("type")).toBe("password");
    // Break-glass signs in by password alone: an email field would only be one
    // more thing to get wrong.
    expect(document.querySelectorAll("input")).toHaveLength(1);
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.queryByRole("button", { name: /continue with/i })).toBeNull();
    // A reset by email is one of the methods this page exists to work without.
    expect(screen.queryByRole("button", { name: /forgot password/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Back to sign-in" }).getAttribute("href")).toBe("/login");
  });

  it("submits the password, and only the password", async () => {
    const action = vi.fn(async () => ({}));
    render(<RecoverySignInPage breakGlassSignInAction={action} />);

    fireEvent.change(passwordField(), { target: { value: "correct horse battery staple" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(action).toHaveBeenCalledWith("correct horse battery staple"));
  });

  it("answers a refusal with one uniform sentence about the password", async () => {
    render(<RecoverySignInPage breakGlassSignInAction={async () => ({ error: "invalid_credentials" })} />);

    fireEvent.change(passwordField(), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect((await screen.findByRole("alert")).textContent).toBe("That password isn't right.");
  });

  it("shows no error while a successful sign-in navigates away", async () => {
    const { redirect } = await import("next/navigation");
    let redirectError: unknown;
    try {
      redirect("/");
    } catch (error) {
      redirectError = error;
    }
    render(<RecoverySignInPage breakGlassSignInAction={async () => Promise.reject(redirectError)} />);

    fireEvent.change(passwordField(), { target: { value: "correct horse battery staple" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await screen.findByRole("button", { name: "Signing in…" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

/**
 * The page must stay unlinked from `/login`: linking it would put the password
 * form one click from everyone and undo the admin's switch. Checked with the
 * states where a link would be most tempting — nothing offered, and the
 * provider-only page this incident came from.
 */
describe("/login never links to the recovery page", () => {
  const actions = {
    signInAction: async () => "",
    requestOtpAction: async () => ({}),
    otpSignInAction: async () => ({}),
    passwordSignInAction: async () => ({}),
    changeEmailAction: async () => {},
    requestPasswordResetAction: async () => ({}),
    confirmPasswordResetAction: async () => ({}),
    abandonPasswordResetAction: async () => {},
  };
  const GOOGLE: SignInMethod = { id: "google", type: "redirect", display_name: "Google" };

  it.each([
    ["nothing offered", [] as SignInMethod[]],
    ["providers only", [GOOGLE]],
  ])("with %s", (_state, methods) => {
    const { container } = render(<LoginPage methods={methods} {...actions} />);

    expect(container.querySelector('a[href*="/login/recovery"]')).toBeNull();
    expect(container.textContent).not.toMatch(/recovery|administrator sign-in/i);
  });
});
