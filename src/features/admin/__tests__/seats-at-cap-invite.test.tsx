// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UsersManagementPage } from "../users-management-page";

// jsdom lacks the layout APIs some Radix internals rely on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

const bffFetchMock = vi.fn();
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (...args: unknown[]) => bffFetchMock(...args) };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  bffFetchMock.mockReset();
  bffFetchMock.mockImplementation(async (path: string) => {
    if (path.startsWith("/api/admin/seats")) {
      // Every seat taken: the state where the next seat invite is refused.
      return {
        seats_purchased: 5,
        seats_used: 4,
        seats_pending: 1,
        seats_occupied: 5,
        unlimited: false,
      };
    }
    if (path.startsWith("/api/admin/roles")) return { roles: ["admin", "editor", "guest"] };
    if (path.startsWith("/api/admin/invitations")) return { invitations: [] };
    if (path.startsWith("/api/admin/users")) return { users: [], total: 0 };
    throw new Error(`unexpected bffFetch: ${path}`);
  });
});
afterEach(cleanup);

/**
 * AC-10. The seat guard rejects on `occupied + 1 > purchased`, so it is tempting
 * to disable Invite once the counters meet. Two reasons not to, pinned here
 * because both are invisible from the button's own code:
 *
 *  1. Inviting a **guest** holds no seat and succeeds at a full cap, so a
 *     disabled button would block a legal action.
 *  2. Deciding what the backend will permit is the backend's job; the frontend
 *     shows numbers and lets the 403 (which already has its own toast) answer.
 */
describe("Invite button at the seat cap", () => {
  it("stays enabled when every seat is occupied", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <UsersManagementPage />
      </QueryClientProvider>,
    );

    // Wait for the indicator, so the assertion runs with the counters loaded
    // rather than before the at-cap state has reached the page at all.
    await waitFor(() => expect(document.querySelector('[data-testid="seats-indicator"]')).toBeTruthy());

    const invite = screen.getByRole("button", { name: /Invite user/i });
    expect(invite).toBeTruthy();
    expect(invite.hasAttribute("disabled")).toBe(false);
    expect(invite.getAttribute("aria-disabled")).not.toBe("true");
  });

  /**
   * AC-09, the half that only exists at page level: the header carries two
   * counters whose numbers legitimately disagree. The caption counts every
   * non-blocked account (guests included); seats_used counts seat roles only.
   * On the live stack that reads "6 active" beside "4 used" — both correct.
   * Were the seats line to call its figure "active" too, the header would show
   * two contradictory "N active" values, which reads as a bug rather than as
   * two different measures.
   */
  it("does not put two contradictory 'N active' figures in the header (AC-09)", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <UsersManagementPage />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(document.querySelector('[data-testid="seats-indicator"]')).toBeTruthy());

    const seatsLine = document.querySelector('[data-testid="seats-indicator"]')!.textContent ?? "";
    const caption = document.querySelector('[data-testid="header-counts"]')?.textContent ?? "";

    // Both lines are present and distinct...
    expect(caption).toMatch(/\bactive\b/);
    expect(seatsLine).not.toBe(caption);
    // ...and only one of them claims to count "active" anything.
    expect(seatsLine).not.toMatch(/\bactive\b/);
  });
});
