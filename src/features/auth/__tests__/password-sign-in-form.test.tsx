// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { redirect } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PasswordSignInForm } from "@/features/auth/password-sign-in-form";

afterEach(() => cleanup());

function setup(submit = vi.fn(async () => ({}) as { error?: string })) {
  render(<PasswordSignInForm label="Password" submit={submit} />);
  return submit;
}

describe("password sign-in form", () => {
  it("submits the trimmed address with the password", async () => {
    const submit = setup();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "  admin@example.test  " },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter2" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(submit).toHaveBeenCalledWith("admin@example.test", "hunter2"));
  });

  it("stays disabled until both fields are filled", () => {
    setup();
    const button = () => screen.getByRole("button", { name: "Sign in" });

    expect(button().hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "admin@example.test" },
    });
    expect(button().hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "x" } });
    expect(button().hasAttribute("disabled")).toBe(false);
  });

  it("never says which of the two fields was wrong", async () => {
    // Naming one would enumerate accounts, which is exactly what the backend's
    // uniform 401 exists to prevent.
    setup(vi.fn(async () => ({ error: "invalid_credentials" })));

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "admin@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("That email or password isn't right.");
  });

  // A 429 is the limiter, not the password: "isn't right" would send a user
  // with a correct password back into the limiter that is refusing them.
  it("says to wait, not that the password is wrong, when rate limited", async () => {
    setup(vi.fn(async () => ({ error: "otp_rate_limited" })));

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "admin@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "right" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/too many attempts/i);
    expect(alert.textContent).toMatch(/wait/i);
    expect(alert.textContent).not.toMatch(/isn't right/i);
  });

  it("is fillable by a password manager", () => {
    // Without these, a sign-in page pushes people toward weaker credentials.
    setup();

    expect(screen.getByLabelText("Email").getAttribute("autocomplete")).toBe("username");
    const password = screen.getByLabelText("Password");
    expect(password.getAttribute("autocomplete")).toBe("current-password");
    expect(password.getAttribute("type")).toBe("password");
  });

  it("gives each field its own label", () => {
    // An earlier version labelled the EMAIL input "Password" and left the
    // password input with only a placeholder, so a screen reader announced the
    // wrong field and the real one not at all.
    setup();

    expect(screen.getByLabelText("Email").getAttribute("type")).toBe("email");
    expect(screen.getByLabelText("Password").getAttribute("type")).toBe("password");
  });
});

/**
 * A rejected action left the button on "Signing in…" with no message — the
 * form had no way out short of a reload.
 */
describe("when the action itself fails", () => {
  it("comes back from Signing in… and says something went wrong", async () => {
    setup(
      vi.fn(async () => Promise.reject(new Error("An unexpected response was received from the server."))),
    );

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "admin@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter2" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Something went wrong. Try again.");
    expect(screen.getByRole("button", { name: "Sign in" }).hasAttribute("disabled")).toBe(false);
  });
});

/**
 * A successful sign-in redirects, and Next rejects the action's promise with a
 * redirect error while it navigates. Treated as a failure, that flashed
 * "Something went wrong" over every successful sign-in.
 */
describe("when the action redirects", () => {
  it("shows no error and stays on Signing in… while the page leaves", async () => {
    let redirectError: unknown;
    try {
      redirect("/");
    } catch (error) {
      redirectError = error;
    }
    setup(vi.fn(async () => Promise.reject(redirectError)));

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "admin@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter2" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await screen.findByRole("button", { name: "Signing in…" });
    // Let the rejection settle before asserting the absence.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Signing in…" })).toBeTruthy();
  });
});
