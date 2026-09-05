// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "  admin@example.test  " },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "hunter2" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(submit).toHaveBeenCalledWith("admin@example.test", "hunter2"));
  });

  it("stays disabled until both fields are filled", () => {
    setup();
    const button = () => screen.getByRole("button", { name: "Sign in" });

    expect(button().hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "admin@example.test" },
    });
    expect(button().hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "x" } });
    expect(button().hasAttribute("disabled")).toBe(false);
  });

  it("never says which of the two fields was wrong", async () => {
    // Naming one would enumerate accounts, which is exactly what the backend's
    // uniform 401 exists to prevent.
    setup(vi.fn(async () => ({ error: "invalid_credentials" })));

    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "admin@example.test" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("That email or password isn't right.");
  });

  it("is fillable by a password manager", () => {
    // Without these, a sign-in page pushes people toward weaker credentials.
    setup();

    expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("username");
    const password = screen.getByPlaceholderText("Password");
    expect(password.getAttribute("autocomplete")).toBe("current-password");
    expect(password.getAttribute("type")).toBe("password");
  });
});
