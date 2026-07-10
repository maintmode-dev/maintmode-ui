// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Integration } from "@/domain/admin/integration";
import { BffError } from "@/features/_shared/api/bff-fetch";

import { IntegrationDialog } from "../integration-dialog";

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

const SLACK_CONFIGURED: Integration = {
  id: "i-1",
  kind: "slack",
  enabled: true,
  config: { api_url: "https://slack.com/api/" },
  secrets_set: { bot_token: true },
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-09T00:00:00Z",
  updated_by: "admin@maintmode",
};

function renderDialog(props: Partial<React.ComponentProps<typeof IntegrationDialog>> = {}) {
  const onOpenChange = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const element = (p: Partial<React.ComponentProps<typeof IntegrationDialog>>) => (
    <QueryClientProvider client={client}>
      <IntegrationDialog kind="slack" integration={null} open onOpenChange={onOpenChange} {...p} />
    </QueryClientProvider>
  );
  const view = render(element(props));
  return { onOpenChange, view, element };
}

const secretInput = () => document.getElementById("integration-secret-bot_token") as HTMLInputElement | null;

describe("IntegrationDialog", () => {
  it("edit mode renders the stored secret as a locked Configured plate, never an input", () => {
    renderDialog({ integration: SLACK_CONFIGURED });
    expect(screen.getByText("Configured")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Replace" })).toBeTruthy();
    expect(secretInput()).toBeNull();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
  });

  it("destroys a typed secret draft on close and reopen (write-only invariant)", () => {
    // Mirror the integrations-page wiring: closing nulls `kind`, which
    // unmounts the keyed body and its draft state.
    const { view, element } = renderDialog();
    fireEvent.change(secretInput()!, { target: { value: "xoxb-super-secret-draft" } });
    expect(secretInput()!.value).toBe("xoxb-super-secret-draft");

    view.rerender(element({ open: false, kind: null }));
    expect(document.body.innerHTML).not.toContain("xoxb-super-secret-draft");

    view.rerender(element({ open: true, kind: "slack" }));
    expect(secretInput()!.value).toBe("");
  });

  it("keeps the dialog open and shows an inline alert when save fails", async () => {
    const { onOpenChange } = renderDialog();
    fireEvent.change(secretInput()!, { target: { value: "xoxb-token" } });
    bffFetchMock.mockRejectedValueOnce(new BffError(400, "bot_token is invalid"));

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("bot_token is invalid");
    });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(secretInput()!.value).toBe("xoxb-token");
  });

  it("posts the create payload and closes on success", async () => {
    const { onOpenChange } = renderDialog();
    fireEvent.change(secretInput()!, { target: { value: "xoxb-token" } });
    bffFetchMock.mockResolvedValueOnce({ ...SLACK_CONFIGURED });

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const [path, init] = bffFetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/admin/integrations");
    const body = JSON.parse(String(init.body));
    expect(body.kind).toBe("slack");
    expect(body.enabled).toBe(true);
    expect(body.secrets).toEqual({ bot_token: "xoxb-token" });
  });

  it("disables Connect while the required secret is missing", () => {
    renderDialog();
    const connect = screen.getByRole("button", { name: "Connect" }) as HTMLButtonElement;
    expect(connect.disabled).toBe(true);
    fireEvent.change(secretInput()!, { target: { value: "xoxb-token" } });
    expect(connect.disabled).toBe(false);
  });
});
