// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BffError } from "@/features/_shared/api/bff-fetch";

const bffFetchMock = vi.fn();
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (...args: unknown[]) => bffFetchMock(...args) };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import {
  useAssignRole,
  useBlockUser,
  useInviteUser,
  useResendInvitation,
  useRevokeInvitation,
  useRevokeRole,
  useSeatsQuery,
  useUnblockUser,
  useUpdateUserTags,
} from "../use-users-queries";

const SEATS = {
  seats_purchased: 5,
  seats_used: 4,
  seats_pending: 1,
  seats_occupied: 5,
  unlimited: false,
};

let client: QueryClient;

beforeEach(() => {
  bffFetchMock.mockReset();
  bffFetchMock.mockImplementation(async (path: string) => {
    if (String(path).startsWith("/api/admin/seats")) return SEATS;
    return undefined;
  });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(() => client.clear());

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client }, children);
}

const seatsCalls = () =>
  bffFetchMock.mock.calls.filter(([p]) => String(p).startsWith("/api/admin/seats")).length;

describe("useSeatsQuery", () => {
  it("reads the counters from /api/admin/seats", async () => {
    const { result } = renderHook(() => useSeatsQuery(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(SEATS));
  });

  it("does not retry a failed request (AC-07)", async () => {
    bffFetchMock.mockReset();
    bffFetchMock.mockRejectedValue(new BffError(500, "boom"));

    const { result } = renderHook(() => useSeatsQuery(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(bffFetchMock).toHaveBeenCalledTimes(1);
  });
});

/**
 * AC-06, asserted behaviourally: after the mutation settles, the seats endpoint
 * must be hit *again*. Spying on `invalidateQueries` and matching it against
 * `seatsKey()` would pass even if the hook and the query disagreed on the key —
 * the assertion would be checking the test's own constant on both sides.
 */
describe("seat-counter invalidation (AC-06)", () => {
  /** Mounts the seats query, runs `act`, and reports whether seats refetched. */
  async function refetchesAfter(act: () => Promise<void>): Promise<boolean> {
    const { result } = renderHook(() => useSeatsQuery(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    const before = seatsCalls();
    await act();
    try {
      await waitFor(() => expect(seatsCalls()).toBeGreaterThan(before));
      return true;
    } catch {
      return false;
    }
  }

  it("refetches after an invite is sent", async () => {
    const refetched = await refetchesAfter(async () => {
      const { result } = renderHook(() => useInviteUser(), { wrapper });
      await result.current.mutateAsync({ email: "a@b", roles: ["editor"] });
    });
    expect(refetched).toBe(true);
  });

  it.each([
    ["resend", () => useResendInvitation()],
    ["revoke", () => useRevokeInvitation()],
  ])("refetches after a %s succeeds", async (_label, hook) => {
    const refetched = await refetchesAfter(async () => {
      const { result } = renderHook(hook, { wrapper });
      await result.current.mutateAsync("inv-1");
    });
    expect(refetched).toBe(true);
  });

  // The 409 branches are the ones a naive "add it to onSuccess" pass misses,
  // and they are exactly when a seat changed hands: the invitation stopped
  // being pending because it was accepted, revoked or expired.
  it.each([
    ["resend", () => useResendInvitation()],
    ["revoke", () => useRevokeInvitation()],
  ])("refetches when a %s returns 409", async (_label, hook) => {
    const refetched = await refetchesAfter(async () => {
      bffFetchMock.mockImplementation(async (path: string) => {
        if (String(path).startsWith("/api/admin/seats")) return SEATS;
        throw new BffError(409, "no longer pending");
      });
      const { result } = renderHook(hook, { wrapper });
      await result.current.mutateAsync("inv-1").catch(() => {});
    });
    expect(refetched).toBe(true);
  });

  it.each([
    ["block", () => useBlockUser(), { id: "u1" }],
    ["unblock", () => useUnblockUser(), { id: "u1" }],
  ])("refetches after %s", async (_label, hook, args) => {
    const refetched = await refetchesAfter(async () => {
      const { result } = renderHook(hook, { wrapper });
      await result.current.mutateAsync(args as { id: string });
    });
    expect(refetched).toBe(true);
  });

  it.each([
    ["assign", () => useAssignRole()],
    ["revoke", () => useRevokeRole()],
  ])("refetches after a role %s", async (_label, hook) => {
    const refetched = await refetchesAfter(async () => {
      const { result } = renderHook(hook, { wrapper });
      await result.current.mutateAsync({ userId: "u1", role: "editor" });
    });
    expect(refetched).toBe(true);
  });

  // A rejected invite is the one response that states outright that our
  // numbers disagree with the server's, so it has to refresh them too.
  it("refetches when an invite is rejected for exceeding the cap", async () => {
    const refetched = await refetchesAfter(async () => {
      bffFetchMock.mockImplementation(async (path: string) => {
        if (String(path).startsWith("/api/admin/seats")) return SEATS;
        throw new BffError(403, "all 5 of 5 seats are in use", "seats_limit_exceeded");
      });
      const { result } = renderHook(() => useInviteUser(), { wrapper });
      await result.current.mutateAsync({ email: "a@b", roles: ["editor"] }).catch(() => {});
    });
    expect(refetched).toBe(true);
  });

  // The single mutation that must NOT move the counters: a messenger handle
  // holds no seat. Pinned so the omission reads as a decision, not a gap.
  it("does NOT refetch after a tags update", async () => {
    const { result: seatsHook } = renderHook(() => useSeatsQuery(), { wrapper });
    await waitFor(() => expect(seatsHook.current.data).toBeTruthy());
    const before = seatsCalls();

    const { result } = renderHook(() => useUpdateUserTags(), { wrapper });
    await result.current.mutateAsync({ userId: "u1", telegram_tag: "@x" });

    // Positive control first: prove the mutation's *own* invalidation fired.
    // Without it, a broken harness — one where nothing refetches at all —
    // would satisfy "seats did not refetch" and pass for the wrong reason.
    await waitFor(() =>
      expect(bffFetchMock.mock.calls.some(([p]) => String(p).startsWith("/api/admin/users"))).toBe(true),
    );
    expect(seatsCalls()).toBe(before);
  });
});
