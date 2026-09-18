// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const bffFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (...args: unknown[]) => bffFetchMock(...args) };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { BffError } from "@/features/_shared/api/bff-fetch";
import type { AuthMethod } from "@/domain/auth/auth-method-settings";

import { authMethodsKey, useAuthMethodsQuery, useSetAuthMethodEnabled } from "../use-auth-methods-queries";

const BOTH: AuthMethod[] = [
  { method: "email_otp", enabled: true, updated_at: "2026-09-18T00:00:00.000Z" },
  { method: "email_password", enabled: true, updated_at: "2026-09-18T00:00:00.000Z" },
];

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function freshClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

beforeEach(() => {
  bffFetchMock.mockReset();
});

describe("reading the method list", () => {
  it("hands the rows through", async () => {
    bffFetchMock.mockResolvedValue({ methods: BOTH });
    const client = freshClient();

    const { result } = renderHook(() => useAuthMethodsQuery(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((m) => m.method)).toEqual(["email_otp", "email_password"]);
  });

  /**
   * SPEC §4.1. The migration seeds both rows, so an empty list means the
   * backend's table is not in the state it should be. Rendering a friendly
   * "nothing here yet" would tell an admin that no sign-in method is
   * configured, on a screen whose entire job is to report exactly that.
   *
   * Note this is where the check lives: the BFF route passes the 200 through
   * untouched (asserted in the contract test), and the browser judges.
   */
  it("treats an empty list as a fault, not an empty state", async () => {
    bffFetchMock.mockResolvedValue({ methods: [] });
    const client = freshClient();

    const { result } = renderHook(() => useAuthMethodsQuery(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  /** The same fault, arriving as a missing key rather than an empty array. */
  it("treats a missing `methods` key as a fault", async () => {
    bffFetchMock.mockResolvedValue({});
    const client = freshClient();

    const { result } = renderHook(() => useAuthMethodsQuery(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("toggling a method", () => {
  it("moves the switch before the server answers", async () => {
    const client = freshClient();
    client.setQueryData(authMethodsKey(), BOTH);
    let resolve: (v: unknown) => void = () => {};
    bffFetchMock.mockImplementation(() => new Promise((r) => (resolve = r)));

    const { result } = renderHook(() => useSetAuthMethodEnabled(), { wrapper: wrapper(client) });
    act(() => {
      result.current.mutate({ method: "email_otp", enabled: false });
    });

    await waitFor(() => {
      const rows = client.getQueryData<AuthMethod[]>(authMethodsKey());
      expect(rows?.find((m) => m.method === "email_otp")?.enabled).toBe(false);
    });

    act(() => resolve({ method: "email_otp", enabled: false, updated_at: "x" }));
  });

  it("puts the switch back when the backend refuses", async () => {
    const client = freshClient();
    client.setQueryData(authMethodsKey(), BOTH);
    bffFetchMock.mockRejectedValue(new BffError(404, "no such built-in method"));

    const { result } = renderHook(() => useSetAuthMethodEnabled(), { wrapper: wrapper(client) });
    act(() => {
      result.current.mutate({ method: "email_otp", enabled: false });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const rows = client.getQueryData<AuthMethod[]>(authMethodsKey());
    expect(rows?.find((m) => m.method === "email_otp")?.enabled).toBe(true);
  });

  /**
   * The case the integrations hook gets wrong, and the reason this hook is not
   * a copy of it.
   *
   * There, rollback is gated on `previousEnabled !== undefined`, with the prior
   * value read as a scalar off the cached row. A row that is not in the cache
   * yields `undefined`, the guard skips, and the switch stays where the
   * optimistic update left it — showing a method as disabled that the backend
   * just refused to disable. Harmless there (every row comes from the list);
   * here it lands on exactly the unknown-method row the screen exists to
   * surface.
   *
   * This case is the mutation proof, and it took two attempts to write one that
   * bites. Asserting on a row absent from the cache does NOT distinguish the two
   * implementations: the scalar guard skips the restore, and there is no row to
   * restore anyway, so both leave the cache identical. The difference only
   * becomes observable when the row EXISTS and its prior value is falsy-or-
   * absent — then the scalar guard reads `undefined`, decides it has nothing to
   * put back, and leaves the optimistic `enabled: false` standing.
   *
   * Reverting this hook to `context?.previousEnabled !== undefined` must red
   * this case. It does.
   */
  it("restores a row whose previous flag was not a boolean", async () => {
    const client = freshClient();
    // A row mid-flight from a partial response: present, but without a flag.
    client.setQueryData(authMethodsKey(), [
      { method: "email_otp", updated_at: "2026-09-18T00:00:00.000Z" } as unknown as AuthMethod,
      BOTH[1],
    ]);
    bffFetchMock.mockRejectedValue(new BffError(404, "no such built-in method"));

    const { result } = renderHook(() => useSetAuthMethodEnabled(), { wrapper: wrapper(client) });
    act(() => {
      result.current.mutate({ method: "email_otp", enabled: false });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const row = client.getQueryData<AuthMethod[]>(authMethodsKey())?.find((m) => m.method === "email_otp");
    // The optimistic `false` must be gone. The scalar-guard implementation
    // leaves it in place, which is the bug this test exists for.
    expect(row?.enabled).toBeUndefined();
  });

  it("restores a row that was not in the cache when the toggle started", async () => {
    const client = freshClient();
    client.setQueryData(authMethodsKey(), BOTH);
    bffFetchMock.mockRejectedValue(new BffError(404, "no such built-in method"));

    const { result } = renderHook(() => useSetAuthMethodEnabled(), { wrapper: wrapper(client) });
    act(() => {
      // Never in the cache: the optimistic write cannot find it either.
      result.current.mutate({ method: "webauthn", enabled: false });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const rows = client.getQueryData<AuthMethod[]>(authMethodsKey());
    // The known rows must be untouched — a failed toggle of an absent row must
    // not leave a phantom behind or disturb its neighbours.
    expect(rows?.map((m) => ({ method: m.method, enabled: m.enabled }))).toEqual([
      { method: "email_otp", enabled: true },
      { method: "email_password", enabled: true },
    ]);
  });

  it("sends the target state, not a flip", async () => {
    const client = freshClient();
    client.setQueryData(authMethodsKey(), BOTH);
    bffFetchMock.mockResolvedValue({ method: "email_otp", enabled: false, updated_at: "x" });

    const { result } = renderHook(() => useSetAuthMethodEnabled(), { wrapper: wrapper(client) });
    act(() => {
      result.current.mutate({ method: "email_otp", enabled: false });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(bffFetchMock).toHaveBeenCalledWith(
      "/api/admin/auth-methods/email_otp",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ enabled: false }) }),
    );
  });

  it("encodes a method name that would otherwise break the path", async () => {
    const client = freshClient();
    client.setQueryData(authMethodsKey(), BOTH);
    bffFetchMock.mockResolvedValue({ method: "a/b", enabled: false, updated_at: "x" });

    const { result } = renderHook(() => useSetAuthMethodEnabled(), { wrapper: wrapper(client) });
    act(() => {
      result.current.mutate({ method: "a/b", enabled: false });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(bffFetchMock.mock.calls[0]?.[0]).toBe("/api/admin/auth-methods/a%2Fb");
  });
});
