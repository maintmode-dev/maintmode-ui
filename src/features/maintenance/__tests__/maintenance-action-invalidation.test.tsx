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

import { toast } from "sonner";

import { useCancelMaintenance, useMaintenanceAction } from "../queries/use-maintenance-actions";

beforeEach(() => {
  bffFetchMock.mockReset();
  // The 409-message tests read `toast.error.mock.calls.at(-1)`, which would
  // otherwise pick up a neighbouring test's toast.
  vi.mocked(toast.error).mockClear();
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

/**
 * AC-13 (RUK-247). All three of these are 409s, but only one of them is
 * actually "the maintenance changed elsewhere". The approve fingerprint covers
 * the neighbouring conflicts too — their scope, their resources, the overlap
 * bounds — none of which `observed_maint_revision` guards and none of which the
 * operator can see change. After the RUK-247 fix the conflicts-changed 409
 * becomes the common one, so a single blanket message would be wrong more often
 * than right.
 *
 * The fixture carries BOTH codes on purpose: a one-code test passes against an
 * implementation that still emits a single string.
 */
describe("useMaintenanceAction — 409 messages name the right cause", () => {
  async function approveRejectingWith(code: string): Promise<string> {
    bffFetchMock.mockImplementation(() => Promise.reject(new BffError(409, "conflict", code)));
    const { client } = trackedClient();
    const { result } = renderAction(client);

    act(() => {
      result.current.mutate({ id: "m-1", action: "approve", revision: 1 });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    const errorToast = vi.mocked(toast.error);
    expect(errorToast).toHaveBeenCalled();
    return String(errorToast.mock.calls.at(-1)?.[0] ?? "");
  }

  it("blames the surrounding conflicts when the conflict set moved", async () => {
    const message = await approveRejectingWith("conflicts changed since preview");
    expect(message).toMatch(/conflicting/i);
    // Must NOT claim this maintenance changed — it didn't; a neighbour did.
    expect(message).not.toMatch(/this maintenance changed/i);
  });

  it("blames the maintenance itself when the revision went stale", async () => {
    const message = await approveRejectingWith("maintenance changed since preview");
    // `/maintenance changed/i` would be too loose: the generic fallback says
    // "the maintenance changed elsewhere" too, so deleting this branch entirely
    // would still pass. Pin the demonstrative that only this branch uses.
    expect(message).toMatch(/this maintenance changed/i);
  });

  it("offers a retry for a serialization failure", async () => {
    // The only genuinely retryable one: the backend exhausted its serializable
    // retries, nothing about the data is wrong.
    const message = await approveRejectingWith("concurrent modification");
    // NOT `/try again/i` — all four branches end in some form of "try again",
    // so that assertion passes against an implementation that maps nothing.
    expect(message).toMatch(/server was busy/i);
    // And it must not invent a cause: this is a serialization retry, not
    // someone else editing the record.
    expect(message).not.toMatch(/modified|changed/i);
  });

  it("falls back to the generic message for an unknown code", async () => {
    // An older backend, or a code we have not mapped yet.
    const message = await approveRejectingWith("something new");
    // `/changed elsewhere/i` alone would be too loose — the mapped
    // "maintenance changed since preview" branch says "this maintenance changed
    // elsewhere" and would satisfy it, so collapsing the two would pass. Pin
    // the article that only the generic wording uses.
    expect(message).toMatch(/the maintenance changed elsewhere/i);
    expect(message).not.toMatch(/this maintenance changed/i);
  });
});

describe("useMaintenanceAction — a too-large body does not advise retrying", () => {
  it("names the size problem instead of saying 'Try again'", async () => {
    // The BFF caps the forwarded body at 16 KB, and the approve payload scales
    // with conflicts × resources — a heavily-conflicted maintenance can cross
    // it. Falling through to the generic handler tells the operator to retry,
    // which is guaranteed to fail identically forever and gives them no clue
    // why. Measured worst case on the current data is 80% of the cap, so this
    // is close rather than hypothetical.
    bffFetchMock.mockImplementation(() =>
      Promise.reject(new BffError(413, "Request body too large", "BODY_TOO_LARGE")),
    );
    const { client } = trackedClient();
    const { result } = renderAction(client);

    act(() => {
      result.current.mutate({ id: "m-1", action: "approve", revision: 1 });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    const message = String(vi.mocked(toast.error).mock.calls.at(-1)?.[0] ?? "");
    expect(message).toMatch(/too (large|many)/i);
    expect(message).not.toMatch(/try again/i);
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
