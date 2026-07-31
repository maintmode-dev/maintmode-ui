// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BffError } from "@/features/_shared/api/bff-fetch";

const bffFetchMock = vi.fn();
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (...args: unknown[]) => bffFetchMock(...args) };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useCancelMaintenance, useMaintenanceAction } from "../queries/use-maintenance-actions";

beforeEach(() => {
  bffFetchMock.mockReset();
});
afterEach(cleanup);

/**
 * Records every key handed to `invalidateQueries`, so a test can assert which
 * caches a mutation actually touches rather than inferring it from behavior.
 */
function trackedClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidated: unknown[][] = [];
  const original = client.invalidateQueries.bind(client);
  client.invalidateQueries = ((filters?: { queryKey?: unknown[] }) => {
    if (filters?.queryKey) invalidated.push(filters.queryKey);
    return original(filters as never);
  }) as typeof client.invalidateQueries;
  return { client, invalidated };
}

function renderAction(client: QueryClient) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useMaintenanceAction(), { wrapper });
}

/** Did anything invalidate the approvals queue, at any page? */
function invalidatedApprovals(keys: unknown[][]): boolean {
  return keys.some((key) => Array.isArray(key) && key[0] === "approvals");
}

describe("useMaintenanceAction — approvals queue invalidation", () => {
  it("invalidates the approvals queue after a successful approve", async () => {
    // The reason this matters: with the quick-sheet's Approve button reachable
    // from /approvals, approving never leaves the page. The default staleTime
    // is 30s and refetchOnWindowFocus is off, so without this invalidation the
    // just-approved row keeps sitting in the queue — and since drafts can
    // legitimately linger there (no rework flow yet), the user cannot tell a
    // stale list from a real one.
    bffFetchMock.mockResolvedValue({});
    const { client, invalidated } = trackedClient();
    const { result } = renderAction(client);

    await act(async () => {
      result.current.mutate({ id: "m-1", action: "approve", revision: 3, conflicts: [] });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidatedApprovals(invalidated)).toBe(true);
  });

  it("invalidates with a bare prefix so every page of the queue is covered", async () => {
    // The query key is ["approvals", offset]. Invalidating a specific page
    // would leave the others stale, so the prefix must carry no offset.
    bffFetchMock.mockResolvedValue({});
    const { client, invalidated } = trackedClient();
    const { result } = renderAction(client);

    await act(async () => {
      result.current.mutate({ id: "m-1", action: "approve" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const approvalsKeys = invalidated.filter((k) => Array.isArray(k) && k[0] === "approvals");
    expect(approvalsKeys).toContainEqual(["approvals"]);
  });

  it("invalidates the queue on a 409 too", async () => {
    // A stale-revision 409 means the maintenance moved on without us; the
    // queue is just as wrong as the detail view, and the existing handler
    // already refetches the detail for exactly that reason.
    bffFetchMock.mockImplementation(() => Promise.reject(new BffError(409, "revision diverged", "conflict")));
    const { client, invalidated } = trackedClient();
    const { result } = renderAction(client);

    // `mutate` (fire-and-forget) rather than `mutateAsync`: the hook handles the
    // rejection in its own onError, and awaiting the promise here would make the
    // same rejection surface a second time as an unhandled one.
    act(() => {
      result.current.mutate({ id: "m-1", action: "approve", revision: 1 });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidatedApprovals(invalidated)).toBe(true);
  });

  it("still invalidates the detail and calendar caches", async () => {
    // Regression guard: the queue key is added alongside the existing two,
    // not in place of them.
    bffFetchMock.mockResolvedValue({});
    const { client, invalidated } = trackedClient();
    const { result } = renderAction(client);

    await act(async () => {
      result.current.mutate({ id: "m-1", action: "start" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidated).toContainEqual(["maintenance-detail", "m-1"]);
    expect(invalidated).toContainEqual(["calendar"]);
  });
});

describe("useCancelMaintenance — approvals queue invalidation", () => {
  it("invalidates the approvals queue after a cancel", async () => {
    // Approve and cancel are a draft's only two exits from the queue, so a
    // canceled maintenance leaves the list exactly as stale as an approved one.
    bffFetchMock.mockResolvedValue({});
    const { client, invalidated } = trackedClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCancelMaintenance(), { wrapper });

    await act(async () => {
      result.current.mutate({ id: "m-2", reason: "mistake" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidatedApprovals(invalidated)).toBe(true);
  });
});
