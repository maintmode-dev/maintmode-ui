// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DevLoginAs } from "../dev-login-as";

// This config has no global testing-library auto-cleanup, so unmount between
// tests to keep the document free of stale renders.
afterEach(() => cleanup());

describe("DevLoginAs", () => {
  it("renders a collapsed dev toolbar trigger", () => {
    render(<DevLoginAs loginAsAction={vi.fn(async () => {})} />);

    // Collapsed by default: the badge trigger is present, the panel is not.
    expect(screen.getByRole("button", { name: /dev login-as toolbar/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Login as" })).toBeNull();
  });

  it("reveals a role picker (default admin) + button when opened", () => {
    render(<DevLoginAs loginAsAction={vi.fn(async () => {})} />);

    fireEvent.click(screen.getByRole("button", { name: /dev login-as toolbar/i }));

    expect(screen.getByText(/seeded role/i)).toBeTruthy();
    expect(screen.getByLabelText("Role to sign in as").textContent).toContain("admin");
    expect(screen.getByRole("button", { name: "Login as" })).toBeTruthy();
  });

  it("offers exactly the four assignable roles", () => {
    render(<DevLoginAs loginAsAction={vi.fn(async () => {})} />);

    fireEvent.click(screen.getByRole("button", { name: /dev login-as toolbar/i }));

    // Radix mirrors the options into a native <select> for form/a11y; read them
    // there rather than driving the portalled listbox (unreliable in jsdom).
    const values = Array.from(document.querySelectorAll("option")).map((o) => o.textContent);
    expect(values).toEqual(["admin", "reviewer", "editor", "guest"]);
  });
});
