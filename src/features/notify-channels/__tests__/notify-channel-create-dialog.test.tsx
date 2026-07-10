// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BffError } from "@/features/_shared/api/bff-fetch";

import { NotifyChannelCreateDialog } from "../notify-channel-create-dialog";

// jsdom lacks the layout APIs cmdk (the transport combobox) relies on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

// The sheet renders through a Radix portal into document.body; this config has
// no global testing-library auto-cleanup, so clean up explicitly.
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
  // Transports catalog resolves from the mock; retries off so a 409 rejects
  // immediately instead of retrying.
  bffFetchMock.mockImplementation(async (path: string) => {
    if (typeof path === "string" && path.includes("transports")) {
      return { transports: [{ id: "slack", title: "Slack" }] };
    }
    throw new Error(`unexpected bffFetch: ${path}`);
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const element = (open: boolean) => (
    <QueryClientProvider client={client}>
      <NotifyChannelCreateDialog open={open} onOpenChange={vi.fn()} />
    </QueryClientProvider>
  );
  const view = render(element(true));
  return { view, element };
}

const primary = () => screen.getByRole("button", { name: /Create channel/ }) as HTMLButtonElement;

function fillValidForm() {
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Ops alerts" } });
  // Pick the transport through the combobox popover.
  fireEvent.click(screen.getByRole("combobox", { name: "Select a transport" }));
  fireEvent.click(screen.getByRole("option", { name: /Slack/ }));
  fireEvent.change(screen.getByLabelText(/Channel/), { target: { value: "#ops" } });
}

describe("NotifyChannelCreateDialog", () => {
  it("renders as a centered 560px dialog, not a side sheet", () => {
    renderDialog();
    const content = document.querySelector('[data-slot="dialog-content"]');
    expect(content).not.toBeNull();
    expect(content?.className).toContain("sm:max-w-[560px]");
    expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull();
  });

  it("keeps the primary action disabled until name, transport and channel id are set", () => {
    renderDialog();
    expect(primary().disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Ops alerts" } });
    expect(primary().disabled).toBe(true);
    expect(screen.getByText("Select a transport to continue.")).toBeTruthy();

    fireEvent.click(screen.getByRole("combobox", { name: "Select a transport" }));
    fireEvent.click(screen.getByRole("option", { name: /Slack/ }));
    expect(primary().disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Channel/), { target: { value: "#ops" } });
    expect(primary().disabled).toBe(false);
    expect(screen.getByText("Notifications will be sent to this channel.")).toBeTruthy();
  });

  it("surfaces a 409 inline under Name", async () => {
    renderDialog();
    fillValidForm();
    bffFetchMock.mockRejectedValueOnce(new BffError(409, "conflict"));

    fireEvent.click(primary());

    await waitFor(() => {
      expect(screen.getByText("A channel with this name already exists.")).toBeTruthy();
    });
  });

  it("clears the draft and the inline 409 error on close and reopen", async () => {
    const { view, element } = renderDialog();
    fillValidForm();
    bffFetchMock.mockRejectedValueOnce(new BffError(409, "conflict"));
    fireEvent.click(primary());
    await waitFor(() => {
      expect(screen.getByText("A channel with this name already exists.")).toBeTruthy();
    });

    // Close the way an operator does — the reset lives in the onOpenChange
    // handler, which only fires on user-initiated close.
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    view.rerender(element(false));
    view.rerender(element(true));

    expect(screen.queryByText("A channel with this name already exists.")).toBeNull();
    expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe("");
  });
});
