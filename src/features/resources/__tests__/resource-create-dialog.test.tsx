// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResourceCreateDialog } from "../resource-create-dialog";

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
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const element = (open: boolean) => (
    <QueryClientProvider client={client}>
      <ResourceCreateDialog open={open} onOpenChange={onOpenChange} />
    </QueryClientProvider>
  );
  const view = render(element(true));
  return { onOpenChange, view, element };
}

const nameInput = () => document.getElementById("r-name") as HTMLInputElement;

describe("ResourceCreateDialog", () => {
  it("posts the trimmed payload, omitting blank optional fields, and closes on success", async () => {
    const { onOpenChange } = renderDialog();
    fireEvent.change(nameInput(), { target: { value: "  orders-db  " } });
    bffFetchMock.mockResolvedValueOnce({ id: "r-1", name: "orders-db" });

    fireEvent.click(screen.getByRole("button", { name: /Create resource/ }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const [path, init] = bffFetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/resources");
    // Blank optionals become undefined and drop out of the JSON entirely.
    expect(JSON.parse(String(init.body))).toEqual({ name: "orders-db" });
  });

  it("clears the draft when the dialog closes and reopens", () => {
    const { view, element } = renderDialog();
    fireEvent.change(nameInput(), { target: { value: "draft-name" } });
    fireEvent.change(document.getElementById("r-desc") as HTMLTextAreaElement, {
      target: { value: "draft description" },
    });

    // Close the way an operator does — the reset lives in the onOpenChange
    // handler, which only fires on user-initiated close.
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    view.rerender(element(false));
    view.rerender(element(true));

    expect(nameInput().value).toBe("");
    expect((document.getElementById("r-desc") as HTMLTextAreaElement).value).toBe("");
  });

  it("does not submit a whitespace-only name", () => {
    renderDialog();
    fireEvent.change(nameInput(), { target: { value: "   " } });
    const primary = screen.getByRole("button", { name: /Create resource/ }) as HTMLButtonElement;
    expect(primary.disabled).toBe(true);
    // Belt and braces: the submit guard is separate code from the disabled prop.
    fireEvent.submit(nameInput().closest("form")!);
    expect(bffFetchMock).not.toHaveBeenCalled();
  });
});
