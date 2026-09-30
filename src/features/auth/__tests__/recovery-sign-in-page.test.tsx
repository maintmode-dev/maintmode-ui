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

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, {
    target: { value: password },
  });
}

describe("RecoverySignInPage", () => {
  it("offers a password form and nothing else", () => {
    render(<RecoverySignInPage passwordSignInAction={async () => ({})} />);

    expect(screen.getByRole("heading", { name: "Administrator sign-in" })).toBeTruthy();
    expect(document.querySelector('input[type="password"]')).not.toBeNull();
    expect(screen.queryByRole("button", { name: /continue with/i })).toBeNull();
    // A reset by email is one of the methods this page exists to work without.
    expect(screen.queryByRole("button", { name: /forgot password/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Back to sign-in" }).getAttribute("href")).toBe("/login");
  });

  it("submits the trimmed address and the password to the action", async () => {
    const action = vi.fn(async () => ({}));
    render(<RecoverySignInPage passwordSignInAction={action} />);

    fill("  admin@example.test ", "correct horse");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(action).toHaveBeenCalledWith("admin@example.test", "correct horse"));
  });

  it("answers a refusal the way /login does, naming neither field", async () => {
    render(<RecoverySignInPage passwordSignInAction={async () => ({ error: "invalid_credentials" })} />);

    fill("admin@example.test", "wrong");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect((await screen.findByRole("alert")).textContent).toBe("That email or password isn't right.");
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
    signInAction: async () => {},
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
