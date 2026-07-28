// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/domain/admin/user";

import { meKey, useUpdateMyTags, useUpdateTimezone } from "../use-me-query";

const bffFetchMock = vi.fn();
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (...args: unknown[]) => bffFetchMock(...args) };
});

const me: User = {
  id: "me",
  email: "me@maintmode",
  display_name: "Me",
  roles: ["admin"],
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
  bffFetchMock.mockResolvedValue(me);
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.clearAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

/**
 * The request body is the entire point of these tests: an absent key means
 * "leave that field alone", so an implementation that helpfully fills in the
 * missing keys would silently clobber values it never touched.
 */
function capturedBody(callIndex = 0): string {
  const call = bffFetchMock.mock.calls[callIndex];
  expect(call, "bffFetch was not called").toBeDefined();
  const [path, init] = call as [string, RequestInit];
  expect(path).toBe("/api/me");
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

describe("useUpdateMyTags", () => {
  it("sends only the telegram_tag key when only telegram changed", async () => {
    const { result } = renderHook(() => useUpdateMyTags(), { wrapper });

    result.current.mutate({ telegram_tag: "@x" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(capturedKeys()).toEqual(["telegram_tag"]);
    expect(JSON.parse(capturedBody())).toEqual({ telegram_tag: "@x" });
  });

  it("sends only the slack_tag key when only slack changed", async () => {
    const { result } = renderHook(() => useUpdateMyTags(), { wrapper });

    result.current.mutate({ slack_tag: "@y" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(capturedKeys()).toEqual(["slack_tag"]);
  });

  it("serialises a cleared tag as an explicit null, not an omitted key", async () => {
    const { result } = renderHook(() => useUpdateMyTags(), { wrapper });

    result.current.mutate({ slack_tag: null });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Exact string: null must survive serialisation. Were it dropped, the
    // backend would read "don't touch" instead of "clear".
    expect(capturedBody()).toBe('{"slack_tag":null}');
    expect(capturedKeys()).toEqual(["slack_tag"]);
  });

  it("sends both keys when both tags changed", async () => {
    const { result } = renderHook(() => useUpdateMyTags(), { wrapper });

    result.current.mutate({ telegram_tag: "@a", slack_tag: "@b" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(capturedKeys().sort()).toEqual(["slack_tag", "telegram_tag"]);
    expect(JSON.parse(capturedBody())).toEqual({ telegram_tag: "@a", slack_tag: "@b" });
  });

  it("never injects a timezone key", async () => {
    const { result } = renderHook(() => useUpdateMyTags(), { wrapper });

    result.current.mutate({ telegram_tag: "@x" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(capturedKeys()).not.toContain("timezone");
  });

  it("seeds the ['me'] cache with the PATCH response", async () => {
    const updated: User = { ...me, telegram_tag: "@x" };
    bffFetchMock.mockResolvedValue(updated);
    const { result } = renderHook(() => useUpdateMyTags(), { wrapper });

    expect(queryClient.getQueryData(meKey())).toBeUndefined();

    result.current.mutate({ telegram_tag: "@x" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(meKey())).toEqual(updated);
  });
});

describe("useUpdateTimezone (regression guard)", () => {
  // If someone ever merges the two hooks into one partial-/me mutation that
  // spreads a draft object, this test fails loudly — because a timezone change
  // would start carrying telegram_tag/slack_tag and wipe both tags (SPEC §7).
  it("sends exactly the timezone key and nothing else", async () => {
    const { result } = renderHook(() => useUpdateTimezone(), { wrapper });

    result.current.mutate("Asia/Nicosia");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(capturedKeys()).toEqual(["timezone"]);
    expect(capturedBody()).toBe('{"timezone":"Asia/Nicosia"}');
  });

  it("sends exactly the timezone key when resetting to autodetect", async () => {
    const { result } = renderHook(() => useUpdateTimezone(), { wrapper });

    result.current.mutate(null);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(capturedKeys()).toEqual(["timezone"]);
  });
});
