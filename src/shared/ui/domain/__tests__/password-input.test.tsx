// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PasswordInput } from "../password-input";

afterEach(() => cleanup());

/**
 * UX-3 (v0.2.0-rc). A new password is typed once with nothing to compare it
 * against, so the person typing it has to be able to see it.
 */
describe("PasswordInput", () => {
  it("starts masked and shows what was typed on request", () => {
    render(<PasswordInput aria-label="New password" defaultValue="hunter2-hunter2" />);
    const input = screen.getByLabelText("New password") as HTMLInputElement;
    expect(input.type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.type).toBe("text");
    expect(screen.getByRole("button", { name: "Hide password" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input.type).toBe("password");
  });

  it("never submits the form it sits in", () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <PasswordInput aria-label="New password" />
      </form>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disables the toggle with the field", () => {
    render(<PasswordInput aria-label="New password" disabled />);

    expect(screen.getByRole("button", { name: "Show password" }).hasAttribute("disabled")).toBe(true);
  });
});
