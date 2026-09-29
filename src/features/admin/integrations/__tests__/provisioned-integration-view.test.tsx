// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Integration } from "@/domain/admin/integration";

import { IntegrationDialog } from "../integration-dialog";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const bffFetchMock = vi.fn();
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (...args: unknown[]) => bffFetchMock(...args) };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/**
 * Backend `87da097`. A row declared in the server's config file is shown, never
 * edited: the backend refuses every write to it, and its empty `secrets_set`
 * is by design — the secret lives in the server's secrets file. The edit form
 * would read that emptiness as "no secret" and ask for one.
 */
const PROVISIONED_GOOGLE: Integration = {
  id: "i-google",
  kind: "login",
  name: "google",
  enabled: true,
  config: {
    display_name: "Google",
    issuer_url: "https://accounts.google.com",
    client_id: "local-mock.apps.googleusercontent.com",
    redirect_uri: "http://localhost:8000/api/v1/login/oauth/google/callback",
    undeclared_key: "must-not-render",
  },
  secrets_set: {},
  health: "ok",
  provisioned: true,
  created_at: "2026-09-29T21:20:04Z",
  updated_at: "2026-09-29T21:20:04Z",
};

const PROVISIONED_SLACK: Integration = {
  id: "i-slack",
  kind: "notify",
  name: "slack",
  enabled: false,
  config: { api_url: "https://slack.com/api/" },
  secrets_set: {},
  provisioned: true,
  created_at: "2026-09-29T21:20:04Z",
  updated_at: "2026-09-29T21:20:04Z",
};

function renderDialog(integration: Integration) {
  const onOpenChange = vi.fn();
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <IntegrationDialog
        kind={integration.kind}
        name={integration.name}
        integration={integration}
        open
        onOpenChange={onOpenChange}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

describe("IntegrationDialog — a row declared in the server config file", () => {
  it("is a view, not a form", () => {
    renderDialog(PROVISIONED_GOOGLE);

    expect(screen.getByText("View Google")).toBeTruthy();
    expect(document.querySelectorAll("input, textarea").length).toBe(0);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("button", { name: /save|connect|replace|clear|test config/i })).toBeNull();
  });

  it("shows the stored settings as text, and nothing the kind does not declare", () => {
    renderDialog(PROVISIONED_GOOGLE);

    expect(screen.getByText("local-mock.apps.googleusercontent.com")).toBeTruthy();
    expect(screen.getByText("http://localhost:8000/api/v1/login/oauth/google/callback")).toBeTruthy();
    expect(screen.getByText("Enabled")).toBeTruthy();
    expect(screen.queryByText("must-not-render")).toBeNull();
  });

  it("never reads the empty secrets_set as a missing secret", () => {
    renderDialog(PROVISIONED_GOOGLE);

    expect(screen.getByText(/managed in the server configuration/i)).toBeTruthy();
    expect(screen.queryByText(/not set/i)).toBeNull();
  });

  it("names the config key for a sign-in provider", () => {
    renderDialog(PROVISIONED_GOOGLE);

    expect(screen.getByText(/declared in the server config file/i)).toBeTruthy();
    expect(screen.getByText("oauth_providers.providers.google")).toBeTruthy();
  });

  it("names no config key for a category whose file layout this UI does not know", () => {
    renderDialog(PROVISIONED_SLACK);

    expect(screen.getByText("View Slack")).toBeTruthy();
    expect(screen.getByText(/declared in the server config file/i)).toBeTruthy();
    expect(screen.queryByText(/oauth_providers/)).toBeNull();
    expect(screen.getByText("Disabled")).toBeTruthy();
    expect(document.querySelectorAll("input").length).toBe(0);
  });

  it("offers Close as the footer's only action", () => {
    const { onOpenChange } = renderDialog(PROVISIONED_GOOGLE);
    const footer = document.querySelector<HTMLElement>('[data-slot="create-dialog-footer"]');
    if (!footer) throw new Error("no dialog footer rendered");

    expect(
      within(footer)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Close"]);
    fireEvent.click(within(footer).getByRole("button", { name: "Close" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("names a provider by its display name", () => {
    renderDialog({ ...PROVISIONED_GOOGLE, name: "custom", config: { display_name: "Corporate SSO (mock)" } });

    expect(screen.getByText("View Corporate SSO (mock)")).toBeTruthy();
  });
});
