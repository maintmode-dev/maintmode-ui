// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
// Toasts fire from the mutation hooks; irrelevant here.
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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

  it("disables the primary action when no role is selected", () => {
    renderDialog();
    fireEvent.change(emailInput(), { target: { value: "x@maintmode" } });
    fireEvent.click(roleCheckbox("editor"));
    const primary = screen.getByRole("button", { name: /Send invitation/ }) as HTMLButtonElement;
    expect(primary.disabled).toBe(true);
  });
});
