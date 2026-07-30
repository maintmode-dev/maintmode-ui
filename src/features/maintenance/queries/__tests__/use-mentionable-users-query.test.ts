// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assignableUsersKey } from "../use-assignable-users-query";
import { mentionableUsersKey, useMentionableUsersQuery } from "../use-mentionable-users-query";

const bffFetchMock = vi.fn();
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (...args: unknown[]) => bffFetchMock(...args) };
});

// The real flag is "bff"; the mock branch is exercised by flipping this stub.
const dataSourceMock = vi.hoisted(() => ({ assignableUsers: "bff" as "bff" | "mock" }));
vi.mock("@/features/_shared/api/data-source", () => ({ DATA_SOURCE: dataSourceMock }));

let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  dataSourceMock.assignableUsers = "bff";
  bffFetchMock.mockResolvedValue({ users: [] });
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.clearAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("mentionableUsersKey", () => {
  /**
   * AC-17 regression guard. `assignableUsersKey({})` defaults its roles segment
   * to APPROVER_ROLES, so a shared key function would have the mentions list —
   * guests included — land in the approver picker's cache entry and get offered
   * as approvers. The prefixes must never converge (SPEC §5.4).
   */
  it("never collides with the approver picker's key", () => {
    expect(JSON.stringify(mentionableUsersKey(""))).not.toEqual(JSON.stringify(assignableUsersKey({})));
    expect(JSON.stringify(mentionableUsersKey("ali"))).not.toEqual(
      JSON.stringify(assignableUsersKey({ search: "ali" })),
    );
    // Not merely a length difference: the very first segment differs.
    expect(mentionableUsersKey("")[0]).not.toEqual(assignableUsersKey({})[0]);
  });

  it("includes the search term", () => {
    expect(JSON.stringify(mentionableUsersKey("ali"))).not.toEqual(
      JSON.stringify(mentionableUsersKey("bob")),
    );
    expect(mentionableUsersKey("ali")).toContain("ali");
  });

  it("carries no undefined segment", () => {
    // A raw `undefined` in a key is a serialisation hazard for react-query;
    // the hook normalises an omitted search to "" before building the key.
    expect(mentionableUsersKey("")).toEqual(["mentionable-users", ""]);
  });
});

describe("useMentionableUsersQuery", () => {
  it("derives has_messenger_tag from either handle in the mock branch", async () => {
    dataSourceMock.assignableUsers = "mock";
    const { result } = renderHook(() => useMentionableUsersQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const byId = new Map(result.current.data?.map((u) => [u.id, u]));

    // u-2 (Operations Lead): telegram_tag set, slack_tag null → reachable.
    expect(byId.get("u-2")?.has_messenger_tag).toBe(true);
    // u-3 (Alice Operator): telegram_tag null, slack_tag set → reachable.
    expect(byId.get("u-3")?.has_messenger_tag).toBe(true);
    // u-4 (Bob Viewer, guest): neither handle → not reachable.
    expect(byId.get("u-4")?.has_messenger_tag).toBe(false);

    // Derived, not undefined: the projection must actually carry the key, or
    // mock mode would report "nobody has a handle" for everyone.
    for (const user of result.current.data ?? []) {
      expect(typeof user.has_messenger_tag).toBe("boolean");
    }
  });

  // AC-02: mentions answer "who to warn", not "who may approve" — the guest
  // must survive, unlike in the approver picker.
  it("keeps guests in the list and applies no role filter", async () => {
    dataSourceMock.assignableUsers = "mock";
    const { result } = renderHook(() => useMentionableUsersQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.map((u) => u.id)).toContain("u-4");
    expect(result.current.data?.some((u) => u.roles.includes("guest"))).toBe(true);
  });

  it("requests the endpoint maximum and sends no roles filter", async () => {
    bffFetchMock.mockResolvedValue({
      users: [{ id: "u-9", display_name: "Guest", email: "g@x", roles: ["guest"], has_messenger_tag: false }],
    });
    const { result } = renderHook(() => useMentionableUsersQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const path = bffFetchMock.mock.calls[0]?.[0] as string;
    const query = new URLSearchParams(path.split("?")[1]);
    expect(query.get("limit")).toBe("200");
    expect(query.getAll("roles")).toEqual([]);
  });

  // No client-side re-filter: whatever the backend returns reaches the picker.
  it("passes the response through without dropping non-approver roles", async () => {
    bffFetchMock.mockResolvedValue({
      users: [
        { id: "u-8", display_name: "Guest", email: "g@x", roles: ["guest"], has_messenger_tag: false },
        { id: "u-7", display_name: "Admin", email: "a@x", roles: ["admin"], has_messenger_tag: true },
      ],
    });
    const { result } = renderHook(() => useMentionableUsersQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.map((u) => u.id)).toEqual(["u-8", "u-7"]);
  });
});
