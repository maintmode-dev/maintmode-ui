// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ListUsersPage, User } from "@/domain/admin/user";

import { UsersManagementPage } from "../users-management-page";

// jsdom lacks the layout APIs some Radix internals rely on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

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

const admin: User = {
  id: "me",
  email: "admin@maintmode",
  display_name: "Admin",
  roles: ["admin"],
  connected_providers: [],
  created_at: "2026-01-01T00:00:00Z",
  telegram_tag: null,
  slack_tag: null,
};

function user(id: string, over: Partial<User> = {}): User {
  return { ...admin, id, email: `${id}@maintmode`, display_name: id, roles: ["editor"], ...over };
}

function renderUsers(users: User[]) {
  bffFetchMock.mockImplementation(async (path: string) => {
    if (typeof path !== "string") throw new Error(`unexpected bffFetch: ${String(path)}`);
    if (path === "/api/me") return admin;
    if (path.startsWith("/api/admin/roles")) return { roles: ["admin", "reviewer", "editor", "guest"] };
    // The header's seats indicator queries this on every render. Answered
    // as "unlimited" so the block stays hidden and these assertions keep
    // describing the header they were written for.
    if (path.startsWith("/api/admin/seats")) {
      return { seats_purchased: null, seats_used: 0, seats_pending: 0, seats_occupied: 0, unlimited: true };
    }
    if (path.startsWith("/api/admin/invitations")) return { invitations: [] };
    if (path.startsWith("/api/admin/users")) {
      if (path.includes("active=true")) {
        return { users: [], limit: 1, offset: 0, total: users.length } satisfies ListUsersPage;
      }
      return { users, limit: 50, offset: 0, total: users.length } satisfies ListUsersPage;
    }
    throw new Error(`unexpected bffFetch: ${path}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UsersManagementPage />
    </QueryClientProvider>,
  );
}

function headers(): string[] {
  return [...document.querySelectorAll("thead th")].map((th) => th.textContent?.trim() ?? "");
}

/**
 * Handles ride on the email line inside the User cell — they identify the person
 * the same way the email does. They deliberately get NO column of their own: a
 * handle is found by searching for the one you were told about, and a column
 * would be an em dash on almost every row. These pin the four-column shape so
 * the fifth column cannot creep back in without the decision being revisited.
 */
describe("UsersManagementPage table shape", () => {
  it("renders exactly four columns and no Handles header", async () => {
    renderUsers([user("alpha", { telegram_tag: "@alpha_tg", slack_tag: "@alpha_slack" })]);
    await waitFor(() => expect(document.querySelector("tbody tr")).toBeTruthy());

    expect(document.querySelectorAll("colgroup col")).toHaveLength(4);
    expect(headers()).toEqual(["", "User", "Roles", ""]);
    expect(headers()).not.toContain("Handles");
  });

  it("shows the handles on the email line, not in a column of their own", async () => {
    renderUsers([user("alpha", { telegram_tag: "@alpha_tg", slack_tag: "@alpha_slack" })]);
    await waitFor(() => expect(document.querySelector("tbody tr")).toBeTruthy());

    const row = document.querySelector("tbody tr");
    expect(row?.querySelectorAll("td")).toHaveLength(4);

    // Both handles live inside the User cell, alongside the email.
    const userCell = row?.querySelectorAll("td")[1];
    expect(userCell?.textContent).toContain("@alpha_tg");
    expect(userCell?.textContent).toContain("@alpha_slack");
    expect(userCell?.textContent).toContain("alpha@maintmode");
  });

  it("renders handle values verbatim — the leading @ is neither added nor stripped", async () => {
    renderUsers([user("alpha", { telegram_tag: "bare_no_at", slack_tag: "@with_at" })]);
    await waitFor(() => expect(document.querySelector("tbody tr")).toBeTruthy());

    const cell = document.querySelectorAll("tbody tr td")[1];
    expect(cell.textContent).toContain("bare_no_at");
    expect(cell.textContent).toContain("@with_at");
    // The bare handle must not have grown an @ on the way to the screen.
    expect(cell.textContent).not.toContain("@bare_no_at");
  });

  it("renders nothing for a user with no handles — no placeholder on a mostly empty column", async () => {
    renderUsers([user("alpha", { telegram_tag: null, slack_tag: null })]);
    await waitFor(() => expect(document.querySelector("tbody tr")).toBeTruthy());

    const userCell = document.querySelectorAll("tbody tr td")[1];
    // Only the email is addressable here: one glyph, and no em-dash placeholder.
    expect(userCell.querySelectorAll("svg")).toHaveLength(1);
    expect(userCell.textContent).not.toContain("—");
  });

  it("spans the empty state across all four columns", async () => {
    renderUsers([]);
    await waitFor(() => expect(document.body.textContent).toContain("No users found."));

    const cell = [...document.querySelectorAll("tbody td")].find((td) =>
      td.textContent?.includes("No users found."),
    );
    expect(cell?.getAttribute("colSpan")).toBe("4");
  });

  it("offers handle search in the placeholder, since that is how a handle is found", async () => {
    renderUsers([user("alpha")]);
    await waitFor(() => expect(document.querySelector("tbody tr")).toBeTruthy());

    const search = document.querySelector<HTMLInputElement>('input[placeholder*="Search by name"]');
    expect(search?.placeholder).toBe("Search by name, email or handle…");
  });
});
