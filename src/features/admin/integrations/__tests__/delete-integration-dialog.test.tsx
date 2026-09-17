// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Integration } from "@/domain/admin/integration";

import { DeleteIntegrationDialog } from "../delete-integration-dialog";

const bffFetchMock = vi.fn();
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (...args: unknown[]) => bffFetchMock(...args) };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const GOOGLE: Integration = {
  id: "1",
  kind: "login",
  name: "google",
  enabled: true,
  config: {},
  secrets_set: { client_secret: true },
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

const SLACK: Integration = { ...GOOGLE, id: "2", kind: "notify", name: "slack", secrets_set: {} };

function renderDialog(integration: Integration, label = "Google") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DeleteIntegrationDialog integration={integration} label={label} open onOpenChange={() => {}} />
    </QueryClientProvider>,
  );
}

const deleteButton = () => screen.getByRole("button", { name: "Delete" });

describe("deleting a sign-in provider", () => {
  /**
   * The copy has one job the backend cannot do for it: the cascade unlinks
   * every identity bound to this provider and reports no count, so the dialog
   * must say that the number is unavailable rather than quietly omit it and
   * let an operator assume it is small.
   */
  it("says access is lost, that it cannot be undone, and that no count exists", () => {
    renderDialog(GOOGLE);

    expect(screen.getByText(/loses access/i)).toBeTruthy();
    expect(screen.getByText(/cannot be undone/i)).toBeTruthy();
    expect(screen.getByText(/not available/i)).toBeTruthy();
  });

  it("keeps Delete disabled until the provider name is typed", () => {
    renderDialog(GOOGLE);

    expect(deleteButton().hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "google" } });

    expect(deleteButton().hasAttribute("disabled")).toBe(false);
  });

  it("does not accept a near miss", () => {
    renderDialog(GOOGLE);

    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "googl" } });

    expect(deleteButton().hasAttribute("disabled")).toBe(true);
  });

  /**
   * The assertion that matters most: no request may leave while the
   * confirmation is unsatisfied. Tied to the fetch rather than to the button's
   * disabled attribute, because a future submit path that bypasses the button
   * would keep that attribute intact and still delete.
   */
  it("issues NO request while the confirmation is unsatisfied", async () => {
    renderDialog(GOOGLE);

    fireEvent.click(deleteButton());
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(bffFetchMock).not.toHaveBeenCalled();
  });

  it("deletes by the pair once confirmed", async () => {
    bffFetchMock.mockResolvedValue(undefined);
    renderDialog(GOOGLE);

    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "google" } });
    fireEvent.click(deleteButton());

    await waitFor(() => expect(bffFetchMock).toHaveBeenCalled());
    expect(bffFetchMock.mock.calls[0][0]).toBe("/api/admin/integrations/login/google");
    expect(bffFetchMock.mock.calls[0][1]).toMatchObject({ method: "DELETE" });
  });
});

describe("deleting a transport", () => {
  /** Losing settings is not losing access, so the extra friction would be noise. */
  it("asks for no typed confirmation", () => {
    renderDialog(SLACK, "Slack");

    expect(screen.queryByLabelText(/Type/)).toBeNull();
    expect(deleteButton().hasAttribute("disabled")).toBe(false);
  });

  it("does not claim anyone loses access", () => {
    renderDialog(SLACK, "Slack");

    expect(screen.queryByText(/loses access/i)).toBeNull();
  });
});
