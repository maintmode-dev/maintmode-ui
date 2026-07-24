// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BffError } from "@/features/_shared/api/bff-fetch";

import { InviteUserDialog } from "../invite-user-dialog";

// jsdom lacks the layout APIs some Radix internals rely on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

// The dialog renders through a Radix portal into document.body; this config
// has no global testing-library auto-cleanup, so clean up explicitly.
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const bffFetchMock = vi.fn();
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (...args: unknown[]) => bffFetchMock(...args) };
});
// Toasts fire from the mutation hooks. The error toast is asserted below, so
// keep a handle on the mock.
const toastErrorMock = vi.fn();
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: (...args: unknown[]) => toastErrorMock(...args) } }));

function renderDialog() {
  const onOpenChange = vi.fn();
  // Roles catalog resolves from the mock; anything else must be the invite POST.
  bffFetchMock.mockImplementation(async (path: string) => {
    if (typeof path === "string" && path.includes("/api/admin/roles")) {
      return { roles: ["admin", "reviewer", "editor", "guest"] };
    }
    throw new Error(`unexpected bffFetch: ${path}`);
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const element = (open: boolean) => (
    <QueryClientProvider client={client}>
      <InviteUserDialog open={open} onOpenChange={onOpenChange} />
    </QueryClientProvider>
  );
  const view = render(element(true));
  return { onOpenChange, view, element };
}

const emailInput = () => document.getElementById("invite-email") as HTMLInputElement;
const roleCheckbox = (role: string) => document.getElementById(`invite-role-${role}`) as HTMLButtonElement;

describe("InviteUserDialog", () => {
  it("defaults to the editor role and posts { email, roles } on submit", async () => {
    const { onOpenChange } = renderDialog();
    expect(roleCheckbox("editor").getAttribute("data-state")).toBe("checked");

    fireEvent.change(emailInput(), { target: { value: "new@maintmode" } });
    bffFetchMock.mockResolvedValueOnce({ id: "inv-1" });
    fireEvent.click(screen.getByRole("button", { name: /Send invitation/ }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const inviteCall = bffFetchMock.mock.calls.find(([p]) => String(p).includes("invitations"));
    expect(inviteCall).toBeTruthy();
    expect(JSON.parse(String((inviteCall![1] as RequestInit).body))).toEqual({
      email: "new@maintmode",
      roles: ["editor"],
    });
  });

  it("resets email and restores the editor default on close and reopen", () => {
    const { view, element } = renderDialog();
    fireEvent.change(emailInput(), { target: { value: "draft@maintmode" } });
    fireEvent.click(roleCheckbox("admin"));
    expect(roleCheckbox("admin").getAttribute("data-state")).toBe("checked");

    // Close the way an operator does — the reset lives in the onOpenChange
    // handler, which only fires on user-initiated close.
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    view.rerender(element(false));
    view.rerender(element(true));

    expect(emailInput().value).toBe("");
    expect(roleCheckbox("admin").getAttribute("data-state")).toBe("unchecked");
    expect(roleCheckbox("editor").getAttribute("data-state")).toBe("checked");
  });

  it("shows an own-phrased seats message with a recovery hint, not the raw backend string", async () => {
    const { onOpenChange } = renderDialog();
    fireEvent.change(emailInput(), { target: { value: "over@maintmode" } });
    const rawBackendMessage = "all 5 of 5 seats are in use: seats limit exceeded";
    bffFetchMock.mockRejectedValueOnce(new BffError(403, rawBackendMessage, "seats_limit_exceeded"));
    fireEvent.click(screen.getByRole("button", { name: /Send invitation/ }));

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "You've used all your seats.",
        expect.objectContaining({ description: expect.stringContaining("Free up a seat") }),
      ),
    );
    // The raw backend string must never reach the user.
    const shownStrings = toastErrorMock.mock.calls.flat().map((arg) => JSON.stringify(arg));
    expect(shownStrings.some((s) => s.includes(rawBackendMessage))).toBe(false);
    // A non-retryable failure keeps the dialog open so the admin sees why.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("disables the primary action when no role is selected", () => {
    renderDialog();
    fireEvent.change(emailInput(), { target: { value: "x@maintmode" } });
    fireEvent.click(roleCheckbox("editor"));
    const primary = screen.getByRole("button", { name: /Send invitation/ }) as HTMLButtonElement;
    expect(primary.disabled).toBe(true);
  });
});
