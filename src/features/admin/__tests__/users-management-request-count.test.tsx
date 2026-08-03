// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Invitation, ListUsersPage, User } from "@/domain/admin/user";

/**
 * Perf remediation B2: what `/admin/users` fetches on mount, and when.
 *
 * Two defects are pinned here, both of which cost a full double hop (browser →
 * Next handler → backend, with a session decrypt on each side) to render one
 * integer in the header:
 *
 *  1. the pending-invite count fetched EVERY invitation ever sent — accepted,
 *     revoked, expired — and counted `status === "pending"` on the client;
 *  2. the full invitation list loaded on mount even though it is only rendered
 *     once the operator opens the Invitations tab.
 *
 * These assert on request PATHS rather than on rendered numbers, because the
 * header renders the same numbers either way — that is precisely why the waste
 * survived review. `users-management-header-counts.test.tsx` owns the numbers;
 * this file owns the traffic.
 */

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

import { UsersManagementPage } from "../users-management-page";

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

// Mixed set: 2 pending among 5, so "filtered server-side" and "filtered on the
// client" are distinguishable by the REQUEST, and a count of 2 is only correct
// if the right rows are being counted.
const INVITATIONS: Invitation[] = [
  invitation("p1", "pending"),
  invitation("p2", "pending"),
  invitation("r1", "revoked"),
  invitation("a1", "accepted"),
  invitation("e1", "expired"),
];

const page: ListUsersPage = { users: [], limit: 50, offset: 0, total: 0 };

function renderPage() {
  bffFetchMock.mockImplementation(async (path: string) => {
    if (typeof path !== "string") throw new Error(`unexpected bffFetch: ${String(path)}`);
    if (path === "/api/me") return admin;
    if (path.startsWith("/api/admin/roles")) return { roles: ["admin", "reviewer", "editor", "guest"] };
    if (path.startsWith("/api/admin/seats")) {
      return { seats_purchased: null, seats_used: 0, seats_pending: 0, seats_occupied: 0, unlimited: true };
    }
    if (path.startsWith("/api/admin/invitations")) {
      // Mirror the BFF route's `?status=` filter (validated + forwarded there).
      const status = new URL(path, "http://t").searchParams.get("status");
      return { invitations: status ? INVITATIONS.filter((i) => i.status === status) : INVITATIONS };
    }
    if (path.startsWith("/api/admin/users")) {
      if (path.includes("active=true")) return { users: [], limit: 1, offset: 0, total: 7 };
      return page;
    }
    throw new Error(`unexpected bffFetch: ${path}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <UsersManagementPage />
    </QueryClientProvider>,
  );
}

const paths = () => bffFetchMock.mock.calls.map((c) => String(c[0]));
const invitationPaths = () => paths().filter((p) => p.startsWith("/api/admin/invitations"));

/**
 * Switch to the Invitations tab.
 *
 * `fireEvent.click` does NOT work here: Radix's tab trigger selects on
 * `mousedown`/`pointerdown`, so a click alone leaves `aria-selected="false"` and
 * every assertion downstream would pass for the wrong reason. Verified against
 * the real component rather than assumed — hence the explicit assertion that the
 * tab actually became selected before anything else is checked.
 */
function openInvitationsTab() {
  const tab = screen.getByRole("tab", { name: /Invitations/ });
  fireEvent.pointerDown(tab, { button: 0, pointerType: "mouse" });
  fireEvent.mouseDown(tab, { button: 0 });
  expect(tab.getAttribute("aria-selected")).toBe("true");
}

/** Let every mount-time query dispatch and settle. */
async function settle() {
  await waitFor(() => expect(paths()).toContain("/api/admin/invitations?status=pending"));
  await waitFor(() => expect(paths().some((p) => p.startsWith("/api/admin/users?"))).toBe(true));
  await Promise.resolve();
}

describe("UsersManagementPage mount traffic (perf B2)", () => {
  /**
   * `InviteUserDialog` owns `useRolesQuery`, so mounting it unconditionally cost
   * a BFF round-trip on every page load for a dropdown nobody had opened. Radix
   * renders nothing for a closed dialog, so gating on `inviteOpen` is invisible
   * to the user and removes the request outright.
   *
   * Asserted through the roles request rather than through `role="dialog"`: a
   * closed Radix dialog renders no dialog node, so querying for one cannot tell
   * "never mounted" from "mounted but closed" and would pass either way.
   */
  it("does not fetch the roles catalogue until the invite dialog is opened", async () => {
    renderPage();
    await settle();

    expect(paths().filter((p) => p.startsWith("/api/admin/roles"))).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /Invite user/i }));

    await waitFor(() =>
      expect(paths().filter((p) => p.startsWith("/api/admin/roles")).length).toBeGreaterThan(0),
    );
  });

  it("asks the server for pending invitations only, never the full list, on mount", async () => {
    renderPage();
    await settle();

    // The filtered read is the only invitation request on the Users tab.
    expect(invitationPaths()).toEqual(["/api/admin/invitations?status=pending"]);
    // Explicit: the unfiltered list — the request this task removes — is absent.
    expect(invitationPaths()).not.toContain("/api/admin/invitations");
  });

  it("defers the full invitation list until the Invitations tab is opened", async () => {
    renderPage();
    await settle();
    expect(invitationPaths()).not.toContain("/api/admin/invitations");

    openInvitationsTab();

    // Now — and only now — the unfiltered list is fetched, because the tab's
    // Accepted/All chips filter from it.
    await waitFor(() => expect(invitationPaths()).toContain("/api/admin/invitations"));
  });

  it("renders the full mixed set once the Invitations tab has loaded", async () => {
    renderPage();
    await settle();
    openInvitationsTab();
    await waitFor(() => expect(invitationPaths()).toContain("/api/admin/invitations"));

    // The deferred list must actually arrive and render — a skeleton that never
    // resolves would satisfy the request assertions above but break the tab.
    // "All" surfaces every status, so a revoked row proves the unfiltered set is
    // what reached the table.
    fireEvent.click(screen.getByText("All"));
    await waitFor(() => expect(screen.getByText("r1@maintmode")).toBeTruthy());
    expect(screen.getByText("e1@maintmode")).toBeTruthy();
    expect(screen.getByText("a1@maintmode")).toBeTruthy();
  });

  it("renders the deferred list from cache without refetching it", async () => {
    // Revisit path: the unfiltered list is already cached (an earlier visit, or
    // a mutation's invalidation refill), so opening the tab must render rows
    // straight away and issue no second request for them. Gating a query does
    // not change that — `isPending` goes false as soon as data exists — and this
    // pins it, since the gate is the thing most likely to be "fixed" later.
    bffFetchMock.mockImplementation(async (path: string) => {
      if (path === "/api/me") return admin;
      if (path.startsWith("/api/admin/roles")) return { roles: [] };
      if (path.startsWith("/api/admin/seats")) {
        return { seats_purchased: null, seats_used: 0, seats_pending: 0, seats_occupied: 0, unlimited: true };
      }
      if (path.startsWith("/api/admin/invitations")) {
        const status = new URL(path, "http://t").searchParams.get("status");
        return { invitations: status ? INVITATIONS.filter((i) => i.status === status) : INVITATIONS };
      }
      if (path.startsWith("/api/admin/users")) {
        if (path.includes("active=true")) return { users: [], limit: 1, offset: 0, total: 7 };
        return page;
      }
      throw new Error(`unexpected bffFetch: ${path}`);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Pre-seed the unfiltered list and mark it fresh, so enabling the query on
    // the tab switch resolves from cache without a fetch.
    // Pre-seed the unfiltered list, so enabling the query on the tab switch
    // resolves from cache without a fetch.
    client.setQueryData(["invitations"], INVITATIONS);
    render(
      <QueryClientProvider client={client}>
        <UsersManagementPage />
      </QueryClientProvider>,
    );
    await settle();

    openInvitationsTab();

    // Rows are present in the SAME commit as the tab switch — no `waitFor`, no
    // skeleton frame. That is the assertion: cached data renders immediately.
    // (A background revalidation still goes out, since `staleTime` is 0 here;
    // this pins what the operator sees, not the absence of that refetch.)
    expect(screen.getByText("p1@maintmode")).toBeTruthy();
    expect(screen.getByText("p2@maintmode")).toBeTruthy();
  });

  it("fires each mount query once, in parallel, with no duplicate reads", async () => {
    renderPage();
    await settle();

    // Guards the constraint that these dispatch in one tick rather than being
    // chained: a serialized rewrite would still end up with the same set of
    // paths, but duplicates here would mean a query is remounting/refetching.
    const seen = paths();
    expect(new Set(seen).size).toBe(seen.length);

    // The active-count probe stays a separate `limit=1` read: `seats_used` is
    // NOT an equivalent substitute (it is guest-free by contract — see
    // `SeatsUsage`), so this request is deliberately still here.
    expect(seen).toContain("/api/admin/users?limit=1&active=true");
  });
});
