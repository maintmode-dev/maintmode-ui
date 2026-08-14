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

function renderDialog(
  // BFF shape: the transports route maps the catalog to camelCase domain form.
  transports: { id: string; title: string; transportStatus?: string }[] | "error" = [
    { id: "slack", title: "Slack", transportStatus: "ok" },
  ],
) {
  // Transports catalog resolves from the mock; retries off so a 409 rejects
  // immediately instead of retrying.
  bffFetchMock.mockImplementation(async (path: string) => {
    if (typeof path === "string" && path.includes("transports")) {
      if (transports === "error") throw new Error("catalog unavailable");
      return { transports };
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

/**
 * The dialog's own transport warning — a shadcn `Alert`, which is the single
 * `[data-slot="alert"]` node in this tree (`notify-channel-create-dialog.tsx`
 * renders exactly one).
 *
 * These assertions used to read `getByRole("alert")`, which worked only by
 * accident of there being one alert on screen. RUK-269 gives `Combobox` an
 * always-mounted `sr-only` `role="alert"` live region, and this dialog renders a
 * `Combobox` for the transport picker — so the bare role query would match two
 * nodes and throw "found multiple elements", while the negative assertions would
 * fail outright.
 *
 * Callers assert on `textContent`, not mere presence: this is a document-wide
 * FIRST match, so without a text check, moving `data-slot` onto the live region
 * would leave every positive green while matching the wrong node entirely.
 * Proven by mutation — that swap fails all six only with the text checks in
 * place.
 *
 * `document`, not the render container: `CreateDialog` mounts through a Radix
 * `DialogPortal` into `document.body`, so a container-scoped query would return
 * `null` unconditionally — the negatives would pass vacuously and the positives
 * would fail. Same reason the rest of this file uses `screen` and
 * `document.querySelector` (see the dialog-content assertion above).
 */
const transportWarning = () => document.querySelector('[data-slot="alert"]');

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

  // RUK-199: transport_status in the picker. Non-ok transports stay selectable
  // (weak binding) but are marked in the row and warn after selection.
  describe("transport_status highlighting", () => {
    it("marks non-ok options in the picker but keeps them selectable", async () => {
      renderDialog([
        { id: "slack", title: "Slack", transportStatus: "ok" },
        { id: "telegram", title: "Telegram", transportStatus: "disabled" },
      ]);
      fireEvent.click(screen.getByRole("combobox", { name: "Select a transport" }));
      await waitFor(() => {
        expect(screen.getByText("Integration disabled")).toBeTruthy();
      });

      // Still selectable: choosing it fills the transport and shows the warning.
      fireEvent.click(screen.getByRole("option", { name: /Telegram/ }));
      await waitFor(() => {
        expect(transportWarning()?.textContent).toContain("Telegram integration is disabled");
      });
      expect(screen.getByText(/silently dropped/)).toBeTruthy();
    });

    it("shows the not_configured warning after selecting an unconfigured transport", async () => {
      renderDialog([{ id: "email", title: "Email", transportStatus: "not_configured" }]);
      fireEvent.click(screen.getByRole("combobox", { name: "Select a transport" }));
      fireEvent.click(await screen.findByRole("option", { name: /Email/ }));
      await waitFor(() => {
        expect(transportWarning()?.textContent).toContain("No Email integration is configured");
      });
    });

    it("shows the unreadable warning after selecting an unreadable transport (RUK-200)", async () => {
      renderDialog([{ id: "slack", title: "Slack", transportStatus: "unreadable" }]);
      fireEvent.click(screen.getByRole("combobox", { name: "Select a transport" }));
      await waitFor(() => {
        expect(screen.getByText("Integration unreadable")).toBeTruthy();
      });
      fireEvent.click(await screen.findByRole("option", { name: /Slack/ }));
      await waitFor(() => {
        expect(transportWarning()?.textContent).toContain("credentials can't be read");
      });
      // Points at the secret, not the (healthy-looking) enable toggle.
      expect(screen.queryByText(/is disabled/)).toBeNull();
    });

    it("shows no warning for an ok transport", async () => {
      renderDialog();
      fireEvent.click(screen.getByRole("combobox", { name: "Select a transport" }));
      fireEvent.click(await screen.findByRole("option", { name: /Slack/ }));
      // Confirm the selection actually landed before the negative assertion.
      await waitFor(() => {
        expect(screen.getByRole("combobox", { name: "Select a transport" }).textContent).toContain("Slack");
      });
      expect(transportWarning()).toBeNull();
    });

    it("warns fail-visibly when the catalog omits the status", async () => {
      // Backend older than RUK-198 (or a dropped field) → not_configured, never ok.
      renderDialog([{ id: "slack", title: "Slack" }]);
      fireEvent.click(screen.getByRole("combobox", { name: "Select a transport" }));
      fireEvent.click(await screen.findByRole("option", { name: /Slack/ }));
      await waitFor(() => {
        expect(transportWarning()?.textContent).toContain("No Slack integration is configured");
      });
    });

    it("does not decorate fallback transports when the catalog fails (no data = no signal)", async () => {
      // The inverse of fail-visible: FALLBACK_TRANSPORTS carry no status, so
      // the picker must not accuse integrations it has no data about.
      renderDialog("error");
      fireEvent.click(screen.getByRole("combobox", { name: "Select a transport" }));
      const slack = await screen.findByRole("option", { name: /Slack/ });
      expect(screen.getByRole("option", { name: /Telegram/ })).toBeTruthy();
      expect(screen.getByRole("option", { name: /Email/ })).toBeTruthy();
      expect(screen.queryByText(/^Integration (disabled|not configured|unavailable)$/)).toBeNull();

      fireEvent.click(slack);
      await waitFor(() => {
        expect(screen.getByRole("combobox", { name: "Select a transport" }).textContent).toContain("Slack");
      });
      expect(transportWarning()).toBeNull();
    });
  });
});
