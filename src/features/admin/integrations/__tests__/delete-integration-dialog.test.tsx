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
  provisioned: false,
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

  /**
   * UX-7: the name to type is the one on screen, not the registry key — for
   * `custom` the key appears nowhere in the UI.
   */
  it("asks for the name the screen shows, in any case", () => {
    renderDialog({ ...GOOGLE, name: "custom" }, "Custom OIDC");

    expect(screen.getByLabelText(/Type/).closest("div")?.textContent).toContain("Custom OIDC");
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "custom" } });
    expect(deleteButton().hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "custom oidc" } });
    expect(deleteButton().hasAttribute("disabled")).toBe(false);
  });

  it("points at turning the provider off as the reversible alternative", () => {
    renderDialog(GOOGLE);

    expect(screen.getByText(/turn Google off instead/i)).toBeTruthy();
  });

  it("draws Delete as destructive, not in the primary colour", () => {
    // Slot concatenates classes: a className background lost to the default
    // variant's, which is how this rendered purple.
    renderDialog(GOOGLE);

    expect(deleteButton().className).toMatch(/\bbg-destructive\b/);
    expect(deleteButton().className).not.toMatch(/\bbg-primary\b/);
  });

  it("keeps Delete disabled until the provider name is typed", () => {
    renderDialog(GOOGLE);

    expect(deleteButton().hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "Google" } });

    expect(deleteButton().hasAttribute("disabled")).toBe(false);
  });

  it("does not accept a near miss", () => {
    renderDialog(GOOGLE);

    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "Googl" } });

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

    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "Google" } });
    fireEvent.click(deleteButton());

    await waitFor(() => expect(bffFetchMock).toHaveBeenCalled());
    expect(bffFetchMock.mock.calls[0][0]).toBe("/api/admin/integrations/login/google");
    expect(bffFetchMock.mock.calls[0][1]).toMatchObject({ method: "DELETE" });
  });

  /**
   * One confirmed intent, one cascade.
   *
   * `isPending` from react-query only lands on a re-render, so the disabled
   * attribute cannot stop a second click in the same tick — verified: without
   * the synchronous latch this sends TWO DELETEs. On a probe button that would
   * be a duplicate email; here the backend unlinks every bound identity, twice.
   */
  it("sends ONE request however many times Delete is clicked", async () => {
    bffFetchMock.mockReturnValue(new Promise(() => {}));
    renderDialog(GOOGLE);

    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "Google" } });
    const button = deleteButton();
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(bffFetchMock).toHaveBeenCalled());
    expect(bffFetchMock).toHaveBeenCalledTimes(1);
  });

  /**
   * A failed delete must be retryable: the row is still there, so the latch
   * has to release. Releasing it on SUCCESS instead would be worse than not
   * having it — a late click would delete whatever row was opened next.
   */
  it("lets the operator retry after a failure", async () => {
    bffFetchMock.mockRejectedValueOnce(new Error("network"));
    renderDialog(GOOGLE);

    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: "Google" } });
    fireEvent.click(deleteButton());
    await waitFor(() => expect(bffFetchMock).toHaveBeenCalledTimes(1));

    bffFetchMock.mockResolvedValueOnce(undefined);
    fireEvent.click(deleteButton());
    await waitFor(() => expect(bffFetchMock).toHaveBeenCalledTimes(2));
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

/**
 * A 409 here means the row cannot be deleted from this screen — most likely it
 * was declared in the server's config file after the page loaded. The list
 * refetch turns the row read-only, and a confirmation left open above it would
 * keep offering an armed Delete for a row that no longer has one.
 */
describe("a refused delete", () => {
  it("closes the confirmation on 409", async () => {
    const { BffError } = await import("@/features/_shared/api/bff-fetch");
    bffFetchMock.mockRejectedValueOnce(
      new BffError(
        409,
        "integration is managed by the config file; change it there and restart: notify/slack",
      ),
    );
    const onOpenChange = vi.fn();
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DeleteIntegrationDialog integration={SLACK} label="Slack" open onOpenChange={onOpenChange} />
      </QueryClientProvider>,
    );

    fireEvent.click(deleteButton());

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("stays open on any other failure, so the admin can retry", async () => {
    bffFetchMock.mockRejectedValueOnce(new Error("backend exploded"));
    const onOpenChange = vi.fn();
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DeleteIntegrationDialog integration={SLACK} label="Slack" open onOpenChange={onOpenChange} />
      </QueryClientProvider>,
    );

    fireEvent.click(deleteButton());

    await waitFor(() => expect(bffFetchMock).toHaveBeenCalled());
    await waitFor(() => expect(deleteButton()).toHaveProperty("disabled", false));
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
