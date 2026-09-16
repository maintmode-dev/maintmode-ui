// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bffFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (...args: unknown[]) => bffFetchMock(...args) };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import type { Integration } from "@/domain/admin/integration";

import { IntegrationsPage } from "../integrations-page";

/**
 * RUK-304, and the closest test there is to the bug as an administrator met it.
 *
 * The mapper returning rows is necessary but not sufficient: the screen has its
 * own lookup, and before this fix it was keyed by `kind`. Once `kind` became the
 * category, all three transports collapsed onto one entry, so at most one row
 * could ever render as configured — the rest showed "Set up" beside working
 * integrations. That is the reported defect, one layer above the mapper, and it
 * was measured to survive the entire suite: reverting the key to `kind` left
 * 1659 unit tests green.
 *
 * So these cases assert on the rendered row rather than on internals. What an
 * operator sees is the thing that was wrong.
 */

const CONFIGURED: Integration[] = [
  {
    id: "i-slack",
    kind: "notify",
    name: "slack",
    enabled: true,
    config: {},
    secrets_set: { bot_token: true },
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-02T14:21:00Z",
  },
  {
    id: "i-email",
    kind: "notify",
    name: "email",
    enabled: false,
    config: {},
    secrets_set: { password: true },
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-02T14:21:00Z",
  },
];

/**
 * A login row that COLLIDES by name with a transport.
 *
 * `google` would not test the category filter at all — no transport is called
 * that, so dropping the filter changes nothing. The registry's login half is a
 * separate namespace, so nothing stops a provider from being named `telegram`,
 * and only the category tells the two apart. This is the row that makes the
 * filter load-bearing.
 */
const LOGIN_NAMED_LIKE_A_TRANSPORT: Integration = {
  id: "i-login-telegram",
  kind: "login",
  name: "telegram",
  enabled: true,
  config: {},
  secrets_set: { client_secret: true },
  health: "ok",
  created_at: "2026-07-01T10:00:00Z",
  updated_at: "2026-07-01T10:00:00Z",
};

beforeEach(() => {
  bffFetchMock.mockReset();
});
afterEach(cleanup);

function renderPage(rows: Integration[]) {
  bffFetchMock.mockResolvedValue({ integrations: rows });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "TestQueryWrapper";
  return render(<IntegrationsPage />, { wrapper: Wrapper });
}

/** The row whose label matches, as a container to assert within. */
function rowFor(label: string): HTMLElement {
  const heading = screen.getByText(label);
  const row = heading.closest("div.flex.items-center");
  if (!row) throw new Error(`no row rendered for ${label}`);
  return row as HTMLElement;
}

describe("IntegrationsPage — what the administrator actually sees", () => {
  it("shows EVERY configured transport as configured, not just one", async () => {
    renderPage(CONFIGURED);
    await screen.findByText("Slack");

    // The heart of the regression. Keyed by category, the second row would
    // overwrite the first and one of these would read "Set up".
    expect(within(rowFor("Slack")).queryByText("Set up")).toBeNull();
    expect(within(rowFor("Email")).queryByText("Set up")).toBeNull();
    expect(within(rowFor("Slack")).getByText("Configure")).toBeTruthy();
    expect(within(rowFor("Email")).getByText("Configure")).toBeTruthy();
  });

  it("still offers Set up for a transport that really is unconfigured", async () => {
    renderPage(CONFIGURED);
    await screen.findByText("Slack");

    // Telegram is absent from the response, so this is the honest state — and
    // it is what makes the assertions above non-vacuous.
    expect(within(rowFor("Telegram")).getByText("Set up")).toBeTruthy();
    expect(within(rowFor("Telegram")).queryByText("Configure")).toBeNull();
  });

  it("reflects each row's own enabled flag", async () => {
    renderPage(CONFIGURED);
    await screen.findByText("Slack");

    // Slack is enabled and email is not, in the same response: a lookup that
    // collapsed them would show one flag twice.
    expect(within(rowFor("Slack")).getByRole("switch").getAttribute("data-state")).toBe("checked");
    expect(within(rowFor("Email")).getByRole("switch").getAttribute("data-state")).toBe("unchecked");
  });

  /**
   * The list carries both categories now, and the two halves have independent
   * namespaces. A login provider named `telegram` is NOT the Telegram transport,
   * so a lookup that matched on name alone would show an unconfigured transport
   * as configured — and hand its Configure button a row from the other section.
   */
  it("does not let a login row impersonate a transport with the same name", async () => {
    renderPage([...CONFIGURED, LOGIN_NAMED_LIKE_A_TRANSPORT]);
    await screen.findByText("Slack");

    expect(within(rowFor("Telegram")).getByText("Set up")).toBeTruthy();
    expect(within(rowFor("Telegram")).queryByText("Configure")).toBeNull();
  });

  it("renders every transport as unconfigured when nothing is set up", async () => {
    renderPage([]);
    await screen.findByText("Slack");

    for (const label of ["Slack", "Telegram", "Email"]) {
      expect(within(rowFor(label)).getByText("Set up")).toBeTruthy();
    }
  });

  /**
   * A failed load must look like a failure. The reported bug was precisely a
   * failure that rendered as "nothing is configured", so the error state
   * earning its own assertion is not ceremony.
   */
  it("shows an error rather than an empty registry when the load fails", async () => {
    bffFetchMock.mockRejectedValue(new Error("backend is down"));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    Wrapper.displayName = "TestQueryWrapper";
    render(<IntegrationsPage />, { wrapper: Wrapper });

    expect(await screen.findByText(/Couldn't load integrations/)).toBeTruthy();
    expect(screen.queryByText("Configure")).toBeNull();
  });
});
