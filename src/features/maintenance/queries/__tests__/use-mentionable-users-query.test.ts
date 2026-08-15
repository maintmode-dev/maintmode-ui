// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assignableUsersKey, useAssignableUsersQuery } from "../use-assignable-users-query";
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

  /**
   * The approver key must vary with `roles`, not just with `search`. Both hooks
   * accept a `roles` override, and two different role sets are two different
   * lists — collapsing them onto one entry serves an `admin`-only query from a
   * `reviewer,admin` cache entry and vice versa. The docblock on
   * `mentionableUsersKey` argues the prefixes cannot converge; this pins the
   * other half, that the segments actually discriminate. Dropping the roles
   * segment entirely left the suite green.
   */
  it("gives different approver role sets different cache keys", () => {
    expect(JSON.stringify(assignableUsersKey({ roles: ["admin"] }))).not.toEqual(
      JSON.stringify(assignableUsersKey({ roles: ["reviewer", "admin"] })),
    );
    // The default must resolve to the approver roles, not to an empty segment.
    expect(JSON.stringify(assignableUsersKey({}))).toEqual(
      JSON.stringify(assignableUsersKey({ roles: ["reviewer", "admin"] })),
    );
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

  /**
   * Edit mode mounts the mentions picker and the approver picker side by side,
   * both backed by `/api/users/assignable`. A perf pass once deduplicated them
   * onto ONE unfiltered fetch, deriving approvers with `select`
   * (perf-remediation §8.3, item 1). That was reverted: the shared fetch
   * truncates at `limit` BEFORE the client-side role filter runs, so the
   * approver picker saw an arbitrary slice of approvers — ~60 of 3 214 in
   * production, exactly zero on the local seed (SPEC §0.1).
   *
   * TWO requests is now the correct answer, not a regression. What these tests
   * guard is that the two stay DISTINGUISHABLE: the mentions request must carry
   * no `roles` (or guests vanish from that picker), and the approver request
   * must carry both `roles` AND an explicit `limit` — drop the latter and the
   * backend quietly answers 50 (SPEC §1.1 row 3), which nothing else here can
   * see. Assertions find their request by predicate, never by index: two
   * requests are in flight and their order is not guaranteed.
   */
  describe("approver/mentions requests are separate and correctly parameterized", () => {
    const assignableCalls = () =>
      bffFetchMock.mock.calls.filter((call) => String(call[0]).includes("/api/users/assignable"));

    const RESPONSE = {
      users: [
        { id: "u-admin", display_name: "Admin", email: "a@x", roles: ["admin"], has_messenger_tag: true },
        { id: "u-rev", display_name: "Rev", email: "r@x", roles: ["reviewer"], has_messenger_tag: true },
        { id: "u-guest", display_name: "Guest", email: "g@x", roles: ["guest"], has_messenger_tag: false },
        { id: "u-ed", display_name: "Ed", email: "e@x", roles: ["editor"], has_messenger_tag: false },
      ],
    };

    /**
     * The ONE assignable request matching `predicate` — asserting there is
     * exactly one, so a selector that accidentally matches both pickers fails
     * loudly instead of silently testing whichever came back first.
     */
    const theRequestWhere = (predicate: (query: URLSearchParams) => boolean) => {
      const matches = assignableCalls()
        .map((call) => new URLSearchParams(String(call[0]).split("?")[1] ?? ""))
        .filter(predicate);
      expect(matches).toHaveLength(1);
      return matches[0];
    };

    it("mounts both pickers as two separately parameterized requests", async () => {
      bffFetchMock.mockResolvedValue(RESPONSE);
      // Both hooks in ONE component, mirroring `maintenance-edit-mode.tsx`.
      const { result } = renderHook(
        () => ({ approvers: useAssignableUsersQuery(), mentions: useMentionableUsersQuery() }),
        { wrapper },
      );
      await waitFor(() => expect(result.current.approvers.isSuccess).toBe(true));
      await waitFor(() => expect(result.current.mentions.isSuccess).toBe(true));

      expect(assignableCalls()).toHaveLength(2);

      // The mentions request must stay UNFILTERED — with `roles` on it, that
      // picker silently loses its guests (AC-3).
      const mentions = theRequestWhere((q) => q.getAll("roles").length === 0);
      expect(mentions.get("limit")).toBe("200");

      // The approver request carries `roles` — and `limit` must ride along on
      // THAT request specifically (AC-2). Without it the backend serves 50 and
      // the picker shows a truncated roster with no visible symptom.
      const approvers = theRequestWhere((q) => q.getAll("roles").length > 0);
      expect(approvers.getAll("roles")).toEqual(["reviewer", "admin"]);
      expect(approvers.get("limit")).toBe("200");
    });

    // The mock answers both requests with the same rows, so this isolates the
    // client-side narrowing: approvers keep only reviewer/admin (AC-5), mentions
    // keep everyone (AC-3). Truncation is covered separately, by the endpoint
    // model in `use-assignable-users-truncation.test.ts` (SPEC §4.2).
    it("derives the right two lists from the same rows", async () => {
      bffFetchMock.mockResolvedValue(RESPONSE);
      const { result } = renderHook(
        () => ({ approvers: useAssignableUsersQuery(), mentions: useMentionableUsersQuery() }),
        { wrapper },
      );
      await waitFor(() => expect(result.current.approvers.isSuccess).toBe(true));
      await waitFor(() => expect(result.current.mentions.isSuccess).toBe(true));

      // Approvers: reviewer + admin only. Guest and editor must NOT be offered.
      expect(result.current.approvers.data?.map((u) => u.id)).toEqual(["u-admin", "u-rev"]);
      // Mentions: everyone, guests included (AC-02).
      expect(result.current.mentions.data?.map((u) => u.id)).toEqual(["u-admin", "u-rev", "u-guest", "u-ed"]);
    });

    /**
     * Successor to the old "the dedup must not write `select`'s narrowed list
     * back into the shared entry" test (SPEC §4.4). That invariant retired with
     * `select`; the replacement is stronger and simpler — the two lists live in
     * two cache entries, and each entry holds exactly what its key claims.
     *
     * Mounting the approver hook FIRST is the load-bearing part: under the old
     * dedup it populated the entry the mentions picker then read, so a
     * guest-less approver list could reach that picker. Now it cannot, because
     * it never touches that key at all.
     */
    it("gives each picker its own cache entry holding exactly what its key claims", async () => {
      bffFetchMock.mockResolvedValue(RESPONSE);
      const first = renderHook(() => useAssignableUsersQuery(), { wrapper });
      await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
      expect(first.result.current.data?.map((u) => u.id)).toEqual(["u-admin", "u-rev"]);

      // Same client, mentions mounts afterwards — and must NOT inherit the
      // approver-narrowed list.
      const second = renderHook(() => useMentionableUsersQuery(), { wrapper });
      await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

      expect(second.result.current.data?.map((u) => u.id)).toEqual(["u-admin", "u-rev", "u-guest", "u-ed"]);
      // The mentions key holds the unfiltered list, matching what it claims.
      expect(
        queryClient.getQueryData<typeof RESPONSE.users>(mentionableUsersKey(""))?.map((u) => u.id),
      ).toEqual(["u-admin", "u-rev", "u-guest", "u-ed"]);
      // The approver key holds ONLY approvers — a "reviewer,admin" key must
      // never resolve to everyone (AC-9).
      expect(
        queryClient.getQueryData<typeof RESPONSE.users>(assignableUsersKey({}))?.map((u) => u.id),
      ).toEqual(["u-admin", "u-rev"]);
      // Two entries, two requests.
      expect(queryClient.getQueryCache().getAll()).toHaveLength(2);
      expect(assignableCalls()).toHaveLength(2);
    });

    /**
     * A custom `roles` argument must steer BOTH filters — the one on the wire
     * and the client-side second line of defence. Hardcoding `APPROVER_ROLES`
     * into the client filter passed everything here, because every other test
     * calls the hook with its default roles, where the two are identical.
     */
    it("honours a custom roles argument on the wire and in the client filter", async () => {
      bffFetchMock.mockResolvedValue(RESPONSE);
      const { result } = renderHook(() => useAssignableUsersQuery({ roles: ["editor"] }), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const query = theRequestWhere((q) => q.getAll("roles").length > 0);
      expect(query.getAll("roles")).toEqual(["editor"]);
      // The mock answers with all four rows regardless, so what survives here is
      // decided by the client filter — and it must respect the argument, not the
      // approver default, or the editor is dropped from his own query.
      expect(result.current.data?.map((u) => u.id)).toEqual(["u-ed"]);
    });

    /**
     * Every shape now issues its own request under its own key — the default
     * one included, which is the whole fix. What still needs pinning is that a
     * `search` argument does not collapse onto the default entry, and that it
     * carries the SAME `roles` + `limit` discipline: a searched approver query
     * that lost its `limit` would truncate just as silently.
     *
     * Three calls here, not two: plain approvers, searched approvers, mentions.
     */
    it("keeps a separate request and key for a parameterized call", async () => {
      bffFetchMock.mockResolvedValue(RESPONSE);
      const { result } = renderHook(
        () => ({
          plain: useAssignableUsersQuery(),
          searched: useAssignableUsersQuery({ search: "ali" }),
          mentions: useMentionableUsersQuery(),
        }),
        { wrapper },
      );
      await waitFor(() => expect(result.current.plain.isSuccess).toBe(true));
      await waitFor(() => expect(result.current.searched.isSuccess).toBe(true));
      await waitFor(() => expect(result.current.mentions.isSuccess).toBe(true));

      expect(assignableCalls()).toHaveLength(3);
      // Three distinct cache entries — the searched call must not share the
      // default approver entry, or "ali" results would be served as the full list.
      expect(queryClient.getQueryCache().getAll()).toHaveLength(3);

      const searched = theRequestWhere((q) => q.get("search") === "ali");
      expect(searched.getAll("roles")).toEqual(["reviewer", "admin"]);
      expect(searched.get("limit")).toBe("200");

      // The plain approver call is the roles-carrying one WITHOUT a search.
      const plain = theRequestWhere((q) => q.getAll("roles").length > 0 && !q.get("search"));
      expect(plain.get("limit")).toBe("200");
    });
  });

  /**
   * RUK-270 — a broken response and an empty roster are different facts, and
   * the picker must not render them alike.
   *
   * Before this, `data.users ?? []` resolved SUCCESSFULLY for every shape below,
   * so `isError` stayed false and the operator read "No people found." The two
   * comment blocks that guarded it claimed the opposite ("degrades to an empty
   * picker with an error state") — they described a behaviour the code never had.
   *
   * Both hooks are exercised from one table: they hit the same endpoint and now
   * carry the same guard, and pinning only one leaves the other free to drift.
   */
  describe("a response with no `users` array is an error, not an empty roster", () => {
    const HOOKS = [
      ["mentions", () => useMentionableUsersQuery()],
      ["approver", () => useAssignableUsersQuery()],
    ] as const;

    /**
     * Every shape whose `users` is not an array. The last two are not exotic:
     * `bffFetch` returns `undefined` for a 204 and a raw string for a non-JSON
     * body, so both reach the queryFn on real transport paths. The string case
     * used to be swallowed into `[]`; `{users: "alice"}` was worse still, and
     * reached the mentions picker AS A STRING, since that hook applies no
     * downstream filter.
     */
    const MALFORMED: ReadonlyArray<readonly [string, unknown]> = [
      ["the key is absent", {}],
      ["the key is null", { users: null }],
      ["the key is not an array", { users: "alice" }],
      ["the body is undefined (204)", undefined],
      ["the body is a bare string (non-JSON)", "oops"],
    ];

    for (const [hookName, useHook] of HOOKS) {
      it.each(MALFORMED)(`${hookName}: reports an error when %s`, async (_label, body) => {
        bffFetchMock.mockResolvedValue(body);

        const { result } = renderHook(useHook, { wrapper });
        await waitFor(() => expect(result.current.isError).toBe(true));

        // The error must be OURS, not an incidental TypeError — and this line is
        // what makes the approver rows mean anything. That hook's downstream
        // `returned.filter(...)` throws on every malformed body regardless, so
        // with the guard DELETED `isError` still went true and all five of its
        // cases still passed (measured). Asserting the message discriminates a
        // deliberate rejection from a crash, and keeps the cases honest if the
        // filter that currently props them up is ever refactored away.
        expect(result.current.error?.message).toMatch(/Malformed roster response/);
        // Cold start: no previous page to fall back to.
        expect(result.current.data).toBeUndefined();
      });

      it(`${hookName}: still succeeds on a genuinely empty roster`, async () => {
        // The other half of the contract. `{users: [], total: 0}` is the VALID
        // way to say "nobody", so it must stay a success — otherwise this fix
        // would trade one wrong message for another, and every empty picker
        // would start accusing the backend of being broken.
        bffFetchMock.mockResolvedValue({ users: [], total: 0 });

        const { result } = renderHook(useHook, { wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(result.current.data).toEqual([]);
      });

      it(`${hookName}: leaves mock mode untouched`, async () => {
        // The guard sits on the `bffFetch` result path only. Both queryFns open
        // with a mock branch that returns before any fetch happens, so flipping
        // the flag must still yield a populated list — a guard hoisted to the
        // top of the queryFn would break this and nothing else would notice.
        dataSourceMock.assignableUsers = "mock";
        bffFetchMock.mockResolvedValue(undefined);

        const { result } = renderHook(useHook, { wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(result.current.data?.length).toBeGreaterThan(0);
        expect(bffFetchMock).not.toHaveBeenCalled();
      });
    }
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
