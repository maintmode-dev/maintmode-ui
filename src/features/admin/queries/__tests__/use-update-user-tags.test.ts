// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/domain/admin/user";

import { useUpdateUserTags } from "../use-users-queries";

const bffFetchMock = vi.fn();
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (...args: unknown[]) => bffFetchMock(...args) };
});

// `vi.hoisted` because the `vi.mock` factory is lifted above plain `const`s.
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

const target: User = {
  id: "u-1",
  email: "u1@maintmode",
  display_name: "User One",
  roles: ["editor"],
  connected_providers: [],
  created_at: "2026-01-01T00:00:00Z",
  telegram_tag: null,
  slack_tag: null,
};

let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  bffFetchMock.mockResolvedValue(target);
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.clearAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

function capturedCall(callIndex = 0): [string, RequestInit] {
  const call = bffFetchMock.mock.calls[callIndex];
  expect(call, "bffFetch was not called").toBeDefined();
  return call as [string, RequestInit];
}

function capturedBody(callIndex = 0): string {
  const [, init] = capturedCall(callIndex);
  expect(init.method).toBe("PATCH");
  return init.body as string;
}

/**
 * Assert on the parsed KEY SET, never on `body.slack_tag === undefined`:
 * `JSON.stringify` drops properties whose value is `undefined`, so the weak
 * check passes even against an implementation that always spreads both tag
 * keys into the body (SPEC §7).
 */
function capturedKeys(callIndex = 0): string[] {
  return Object.keys(JSON.parse(capturedBody(callIndex)) as Record<string, unknown>);
}

describe("useUpdateUserTags", () => {
  it("PATCHes the addressed user and sends only the telegram_tag key", async () => {
    const { result } = renderHook(() => useUpdateUserTags(), { wrapper });

    result.current.mutate({ userId: "u-1", telegram_tag: "@x" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [path, init] = capturedCall();
    expect(path).toBe("/api/admin/users/u-1");
    expect(init.method).toBe("PATCH");
    expect(capturedKeys()).toEqual(["telegram_tag"]);
    expect(JSON.parse(capturedBody())).toEqual({ telegram_tag: "@x" });
  });

  // A spread of the whole args object would put the routing field into the
  // payload, where the backend has no DisallowUnknownFields to reject it.
  it("never leaks userId into the body under any spelling", async () => {
    const { result } = renderHook(() => useUpdateUserTags(), { wrapper });

    result.current.mutate({ userId: "u-1", telegram_tag: "@x", slack_tag: "@y" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = capturedKeys();
    expect(keys).not.toContain("userId");
    expect(keys).not.toContain("user_id");
    expect(keys).not.toContain("id");
  });

  it("serialises a cleared tag as an explicit null, not an omitted key", async () => {
    const { result } = renderHook(() => useUpdateUserTags(), { wrapper });

    result.current.mutate({ userId: "u-1", slack_tag: null });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Exact string: null must survive serialisation. Were it dropped, the
    // backend would read "don't touch" instead of "clear".
    expect(capturedBody()).toBe('{"slack_tag":null}');
    expect(capturedKeys()).toEqual(["slack_tag"]);
  });

  it("sends both keys when both tags changed", async () => {
    const { result } = renderHook(() => useUpdateUserTags(), { wrapper });

    result.current.mutate({ userId: "u-1", telegram_tag: "@a", slack_tag: "@b" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(capturedKeys().sort()).toEqual(["slack_tag", "telegram_tag"]);
    expect(JSON.parse(capturedBody())).toEqual({ telegram_tag: "@a", slack_tag: "@b" });
  });

  it("never injects a timezone key", async () => {
    const { result } = renderHook(() => useUpdateUserTags(), { wrapper });

    result.current.mutate({ userId: "u-1", telegram_tag: "@x" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(capturedKeys()).not.toContain("timezone");
  });

  it("percent-encodes a userId that needs escaping", async () => {
    const { result } = renderHook(() => useUpdateUserTags(), { wrapper });

    result.current.mutate({ userId: "a/b?c d", telegram_tag: "@x" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [path] = capturedCall();
    expect(path).toBe("/api/admin/users/a%2Fb%3Fc%20d");
  });

  it("invalidates every cached users page on success", async () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useUpdateUserTags(), { wrapper });

    result.current.mutate({ userId: "u-1", telegram_tag: "@x" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["users"] });
  });

  it("surfaces a failed request to the caller instead of toasting it", async () => {
    const failure = new Error("boom");
    bffFetchMock.mockRejectedValue(failure);
    const { result } = renderHook(() => useUpdateUserTags(), { wrapper });

    result.current.mutate({ userId: "u-1", telegram_tag: "@x" });
    await waitFor(() => expect(result.current.isError).toBe(true));

    // The sheet owns the messaging (it saves roles in the same action), so the
    // hook must stay silent and hand the error over.
    expect(result.current.error).toBe(failure);
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
  });
});
