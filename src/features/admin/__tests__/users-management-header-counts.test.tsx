// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Invitation, ListUsersPage, User } from "@/domain/admin/user";

import { UsersManagementPage } from "../users-management-page";

// Both the header caption and the tab badge interpolate a count next to static
// text (`{n} active · {m} pending invitations`, `Invitations · {n}`), so the
// number and its label are separate text nodes. Exact-string `getByText` can't
// match across that boundary — assert on collapsed textContent instead.
function captionText(): string {
  const el = document.querySelector("p.caption");
  return el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}
function invitationsBadgeText(): string {
  const triggers = Array.from(document.querySelectorAll('[data-slot="tabs-trigger"]'));
  const trigger = triggers.find((t) => t.textContent?.includes("Invitations"));
  return trigger?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

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
};

function user(id: string, blocked = false): User {
  return {
    ...admin,
    id,
    email: `${id}@maintmode`,
    display_name: id,
    roles: ["editor"],
    blocked_at: blocked ? "2026-01-01T00:00:00Z" : null,
  };
}

function invitation(id: string, status: Invitation["status"]): Invitation {
  return {
    id,
    email: `${id}@maintmode`,
    roles: ["editor"],
    status,
    sent_at: "2026-01-01T00:00:00Z",
    expires_at: "2026-02-01T00:00:00Z",
    inviter: { id: "me", email: "admin@maintmode" },
  };
}

/**
 * Wire the BFF mock per route. `activeTotal` is the dataset-wide non-blocked
 * count the backend reports for `active=true`; `page` is the (possibly
 * paginated / search-narrowed) main list; `invitations` is the full invite set.
 */
function renderPage(opts: { activeTotal: number; page: ListUsersPage; invitations: Invitation[] }) {
  // Track invitation-fetch completion so a test can wait for the loaded count
  // even when the correct rendered value equals the pre-fetch default (0).
  const state = { invitationsResolved: false };
  bffFetchMock.mockImplementation(async (path: string) => {
    if (typeof path !== "string") throw new Error(`unexpected bffFetch: ${String(path)}`);
    if (path === "/api/me") return admin;
    if (path.startsWith("/api/admin/roles")) return { roles: ["admin", "reviewer", "editor", "guest"] };
    if (path.startsWith("/api/admin/invitations")) {
      state.invitationsResolved = true;
      return { invitations: opts.invitations };
    }
    if (path.startsWith("/api/admin/users")) {
      // The active-count probe carries `active=true`; everything else is the
      // main table page.
      if (path.includes("active=true")) {
        return { users: [], limit: 1, offset: 0, total: opts.activeTotal } satisfies ListUsersPage;
      }
      return opts.page;
    }
    throw new Error(`unexpected bffFetch: ${path}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <UsersManagementPage />
    </QueryClientProvider>,
  );
  return { view, state };
}

describe("UsersManagementPage header counts", () => {
  it("shows the dataset-wide active count, not just non-blocked rows on the loaded page", async () => {
    // The loaded page holds only 2 users (1 blocked), but the backend reports
    // 40 active accounts across the whole dataset. The caption must trust the
    // dataset total, not the page — the pre-fix code showed "1 active" here.
    const page: ListUsersPage = { users: [user("a"), user("b", true)], limit: 50, offset: 0, total: 41 };
    renderPage({ activeTotal: 40, page, invitations: [] });

    await waitFor(() => expect(captionText()).toMatch(/40 active/));
    expect(captionText()).not.toMatch(/\b1 active/);
  });

  it("counts only pending invitations in the tab badge, ignoring revoked/expired/accepted", async () => {
    // One lone invite, and it's revoked. The badge counted allInvitations.length
    // (→ "Invitations · 1") before the fix; it must now read 0 because nothing
    // is pending. The caption's "0 pending invitations" confirms the same count.
    const page: ListUsersPage = { users: [user("a")], limit: 50, offset: 0, total: 1 };
    const { state } = renderPage({ activeTotal: 1, page, invitations: [invitation("inv-1", "revoked")] });

    // Correct and buggy code both start the badge at 0 (pre-fetch), so waiting
    // on the badge value alone can't tell "loaded, still 0" from "not yet
    // loaded". Wait for the invitation fetch to resolve, then let React flush,
    // so the badge reflects the loaded set — where the bug would show 1.
    await waitFor(() => expect(state.invitationsResolved).toBe(true));
    await waitFor(() => expect(bffFetchMock).toHaveBeenCalledWith("/api/admin/invitations"));
    await Promise.resolve();
    await waitFor(() => expect(captionText()).toMatch(/pending invitations/));

    expect(invitationsBadgeText()).toBe("Invitations · 0");
    expect(captionText()).toMatch(/0 pending invitations/);
  });

  it("badge and caption agree on the pending count", async () => {
    // Two pending among four invites (one revoked, one accepted). Both the badge
    // and the caption must report 2 — not 4 (all) and not 0.
    const page: ListUsersPage = { users: [user("a")], limit: 50, offset: 0, total: 1 };
    renderPage({
      activeTotal: 1,
      page,
      invitations: [
        invitation("p1", "pending"),
        invitation("p2", "pending"),
        invitation("r1", "revoked"),
        invitation("a1", "accepted"),
      ],
    });

    await waitFor(() => expect(captionText()).toMatch(/2 pending invitations/));
    expect(invitationsBadgeText()).toBe("Invitations · 2");
  });
});
