// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AssignableUser } from "@/domain/maintenance/maintenance";
import { resetWarnOnce } from "../assignable-users-limit";
import { assignableUsersKey, useAssignableUsersQuery } from "../use-assignable-users-query";
import { mentionableUsersKey, useMentionableUsersQuery } from "../use-mentionable-users-query";

/**
 * SPEC §4.2 / AC-7 — the test the old suite could not express.
 *
 * The whole suite mocked `bffFetch` with a constant `mockResolvedValue`, so
 * `limit` was a string that got ASSERTED but never APPLIED, and the fixture put
 * both approvers at indices 0-1 of a four-row page. Truncation — the actual bug
 * — was unrepresentable: a hook that drops `roles` and filters client-side over
 * a truncated page looks identical to a correct one when the page is four rows
 * long and half of them are approvers.
 *
 * So the mock below stops being a constant and MODELS THE ENDPOINT: it reads
 * `roles` and `limit` off the query string, filters FIRST and slices SECOND —
 * which is the entire difference between server-side and client-side filtering
 * (SPEC §0.1) — and defaults a MISSING `limit` to 50, the backend default
 * measured in SPEC §1.1 row 3. That default is load-bearing: without it, a fix
 * that restores `roles` but forgets `limit` ships a silent 50-of-3214 picker
 * and passes this test green (SPEC §2.1 warning block, risk B1).
 */

// jsdom lacks the layout APIs some form internals rely on; harmless here.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

/** SPEC §1.1 row 3: no `limit` in the query string means 50, not "unbounded". */
const BACKEND_DEFAULT_LIMIT = 50;
const APPROVER_ROLE_SET = new Set(["reviewer", "admin"]);

const bffFetchMock = vi.fn();
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (...args: unknown[]) => bffFetchMock(...args) };
});

const dataSourceMock = vi.hoisted(() => ({ assignableUsers: "bff" as "bff" | "mock" }));
vi.mock("@/features/_shared/api/data-source", () => ({ DATA_SOURCE: dataSourceMock }));

function user(index: number, roles: readonly string[]): AssignableUser {
  return {
    id: `u-${index}`,
    display_name: `Person ${String(index).padStart(3, "0")}`,
    email: `p${index}@example.com`,
    roles: [...roles],
    has_messenger_tag: false,
  };
}

/**
 * INTERLEAVED — models PRODUCTION. The endpoint sorts by `display_name ASC`
 * with role playing no part (SPEC §1.2), so approvers sit scattered through the
 * roster. 250 rows, every 40th an approver → 250/40 rounded up = 7 approvers at
 * indices 0, 40, 80, 120, 160, 200, 240. Under a client-side filter over the
 * first 200 rows only 5 of those survive (indices 0..160) — a plausible-looking
 * non-empty list that is silently missing 2. THIS is the production shape of the
 * bug, and it is why `length > 0` is not an acceptable assertion.
 */
const INTERLEAVED: AssignableUser[] = Array.from({ length: 250 }, (_, i) =>
  user(i, i % 40 === 0 ? ["reviewer"] : ["guest"]),
);
const INTERLEAVED_APPROVERS = INTERLEAVED.filter((u) => u.roles.some((r) => APPROVER_ROLE_SET.has(r)));

/**
 * CLUSTERED — models the LOCAL SEED (SPEC §1.2): guests sort ahead of the
 * approvers alphabetically, so the first 200 rows are all guests and the
 * client-side filter yields exactly zero. This is the loud version of the same
 * bug — the one that made it visible at all.
 */
const CLUSTERED: AssignableUser[] = Array.from({ length: 250 }, (_, i) =>
  user(i, i < 200 ? ["guest"] : ["admin"]),
);
const CLUSTERED_APPROVERS = CLUSTERED.filter((u) => u.roles.some((r) => APPROVER_ROLE_SET.has(r)));

/**
 * DENSE — the fixture that makes the 200/50 distinction OBSERVABLE.
 *
 * Neither fixture above can: INTERLEAVED holds 7 approvers and CLUSTERED holds
 * 50, so an effective limit of 50 returns all of them and every assertion in
 * this file still passes. Verified by mutation — capping the hook's result at 50
 * rows left the whole suite green, because the only thing pinning `limit=200` is
 * a string assertion on the query, and a string is exactly what SPEC §4.0 says
 * a fully mocked transport can verify while the BEHAVIOUR goes unchecked.
 *
 * That is risk B1 (SPEC §8, rated high, "silent, passes every earlier
 * criterion"). 260 approvers in a 400-row roster means 200 and 50 return
 * measurably different lists, so the limit is now pinned by what comes back and
 * not merely by what goes out.
 */
const DENSE: AssignableUser[] = Array.from({ length: 400 }, (_, i) =>
  user(i, i < 140 ? ["guest"] : ["reviewer"]),
);
const DENSE_APPROVERS = DENSE.filter((u) => u.roles.some((r) => APPROVER_ROLE_SET.has(r)));

/** Query string of a recorded `bffFetch` path. */
function queryOf(path: unknown): URLSearchParams {
  return new URLSearchParams(String(path).split("?")[1] ?? "");
}

/**
 * The recorded requests, parsed. Assertions pick theirs by PREDICATE, never by
 * index: two requests are in flight and their order is not guaranteed (AC-2).
 */
function recordedQueries(): URLSearchParams[] {
  return bffFetchMock.mock.calls.map((call) => queryOf(call[0]));
}

/**
 * Stand-in for `GET /api/v1/users/assignable`. Order of operations is the point:
 * FILTER, then SLICE. Reversing those two lines reproduces the bug under test.
 */
function installEndpoint(roster: AssignableUser[]) {
  bffFetchMock.mockImplementation(async (path: string) => {
    const query = queryOf(path);
    const roles = query.getAll("roles");
    const rawLimit = query.get("limit");
    const limit = rawLimit ? Number(rawLimit) : BACKEND_DEFAULT_LIMIT;

    const filtered = roles.length ? roster.filter((u) => u.roles.some((r) => roles.includes(r))) : roster;
    return { users: filtered.slice(0, limit), total: filtered.length };
  });
}

let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  dataSourceMock.assignableUsers = "bff";
  bffFetchMock.mockReset();
  // The picker warnings fire at most once per session so a standing condition
  // does not become console noise. That state is module-level, so without this
  // reset the first test to warn would silence every later one.
  resetWarnOnce();
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.clearAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("approver picker vs. the endpoint limit (SPEC §4.2, AC-7)", () => {
  it("returns every approver on an interleaved roster — the silent production case", async () => {
    installEndpoint(INTERLEAVED);
    const { result } = renderHook(() => useAssignableUsersQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // EXACT count, not `> 0`. A client-side filter over the first 200 unfiltered
    // rows returns 5 of these 7 and looks perfectly healthy.
    expect(INTERLEAVED_APPROVERS).toHaveLength(7);
    expect(result.current.data).toHaveLength(INTERLEAVED_APPROVERS.length);
    expect(result.current.data?.map((u) => u.id)).toEqual(INTERLEAVED_APPROVERS.map((u) => u.id));
    // Nobody without an approver role may slip through either (AC-5).
    for (const u of result.current.data ?? []) {
      expect(u.roles.some((r) => APPROVER_ROLE_SET.has(r))).toBe(true);
    }
  });

  it("returns every approver on a clustered roster — the loud local-seed case", async () => {
    installEndpoint(CLUSTERED);
    const { result } = renderHook(() => useAssignableUsersQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(CLUSTERED_APPROVERS).toHaveLength(50);
    expect(result.current.data).toHaveLength(CLUSTERED_APPROVERS.length);
    expect(result.current.data?.map((u) => u.id)).toEqual(CLUSTERED_APPROVERS.map((u) => u.id));
    for (const u of result.current.data ?? []) {
      expect(u.roles.some((r) => APPROVER_ROLE_SET.has(r))).toBe(true);
    }
  });

  /**
   * Control. Pins the fixtures' hostility as a measured fact rather than a hope:
   * the unfiltered `limit=200` request the mentions picker sends contains ZERO
   * approvers on the clustered roster. If this ever passes trivially, the
   * fixtures stopped modelling the bug and the two tests above are decoration.
   */
  it("proves the fixture is hostile: the unfiltered limit=200 page holds no approvers", async () => {
    installEndpoint(CLUSTERED);
    const { result } = renderHook(() => useMentionableUsersQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(200);
    expect(result.current.data?.filter((u) => u.roles.some((r) => APPROVER_ROLE_SET.has(r)))).toEqual([]);
  });

  /**
   * B1 guard (SPEC §2.1, risk table §8). Restoring `roles` but forgetting an
   * explicit `limit` lands on the backend default of 50 and serves a truncated
   * roster in silence. The interleaved fixture cannot catch that on its own (it
   * has only 7 approvers), so assert the parameter directly, on the request that
   * actually carries `roles` — found by predicate, never by index, because two
   * requests are now in flight and their order is not guaranteed (AC-2).
   */
  it("sends limit=200 on the roles-carrying request, not the backend default of 50", async () => {
    installEndpoint(CLUSTERED);
    const { result } = renderHook(() => useAssignableUsersQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const query = recordedQueries().find((q) => q.getAll("roles").length > 0);
    expect(query).toBeDefined();
    expect(query?.getAll("roles")).toEqual(["reviewer", "admin"]);
    expect(query?.get("limit")).toBe("200");
  });

  /**
   * B1 guard, BEHAVIOURAL half. The test above asserts the string `limit=200`;
   * this one asserts the consequence, on a roster dense enough for 200 and 50 to
   * differ. Both are needed: the string test catches a dropped parameter, this
   * one catches an effective limit that is wrong for any other reason — a
   * changed constant, a client-side re-slice, a route that fails to forward it.
   */
  it("actually receives 200 approvers, not the backend default of 50", async () => {
    installEndpoint(DENSE);
    const { result } = renderHook(() => useAssignableUsersQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // 260 approvers exist; the endpoint maximum is 200; 50 is the failure mode.
    expect(DENSE_APPROVERS).toHaveLength(260);
    expect(result.current.data).toHaveLength(200);
    // The LAST row of the 200 — the one an effective limit of 50 could never
    // reach. Derived from the fixture, so re-shaping DENSE cannot leave this
    // pinned to a stale id that silently still passes. Asserted against a
    // concrete string (never `undefined === undefined`) via the length check
    // above, which guarantees index 199 exists.
    expect(result.current.data?.[199]?.id).toBe(DENSE_APPROVERS[199].id);
  });

  /**
   * The dev warning of SPEC §2.4 — the muffler made audible. `hasApproverRole`
   * cannot drop a row if the server filter applied, so any row it drops means
   * `roles` did not reach the backend. That warning is the ONLY signal this
   * failure produces (SPEC §9.5: no client telemetry, no Sentry), and nothing
   * asserted it fired — silencing it left the suite green.
   */
  it("warns in dev when the client filter drops a row — the server filter did not apply", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // An endpoint that ignores `roles` entirely: the regression this guards.
    bffFetchMock.mockImplementation(async () => ({ users: CLUSTERED.slice(0, 200), total: 250 }));

    const { result } = renderHook(() => useAssignableUsersQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(warn.mock.calls.flat().join(" ")).toContain("server roles filter did not apply");
    warn.mockRestore();
  });

  it("stays silent when the server filter did apply", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    installEndpoint(CLUSTERED);

    const { result } = renderHook(() => useAssignableUsersQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(warn.mock.calls.flat().join(" ")).not.toContain("server roles filter did not apply");
    warn.mockRestore();
  });

  /**
   * AC-12's observability half. `total` is the only mechanism by which the
   * RUK-218 §13.1 review trigger (`total > limit`) can ever be noticed — the
   * previous code dropped the field from its response type, which is why the
   * trigger firing at ×53 went unseen for so long. Reading it without asserting
   * it would repeat that mistake in a new place.
   */
  it("warns in dev when the roster exceeds the limit it can show", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    bffFetchMock.mockImplementation(async () => ({ users: CLUSTERED_APPROVERS, total: 3214 }));

    const { result } = renderHook(() => useAssignableUsersQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const said = warn.mock.calls.flat().join(" ");
    expect(said).toContain("total=3214");
    expect(said).toContain("RUK-251");
    warn.mockRestore();
  });

  it("stays silent when the roster fits inside the limit", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    installEndpoint(INTERLEAVED); // 7 approvers, total well under 200

    const { result } = renderHook(() => useAssignableUsersQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(warn.mock.calls.flat().join(" ")).not.toContain("RUK-251");
    warn.mockRestore();
  });

  /**
   * `total` counts what the FILTER matched, so on a `search` query a value over
   * the limit says nothing about the picker being truncated — the user narrowed
   * the roster themselves. Warning there trains people to ignore the warning,
   * which is how the original bug stayed hidden behind a message nobody read.
   */
  it("does not warn about a partial slice on a search query", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    installEndpoint(CLUSTERED_APPROVERS);
    bffFetchMock.mockImplementation(async () => ({ users: CLUSTERED_APPROVERS, total: 3214 }));

    const { result } = renderHook(() => useAssignableUsersQuery({ search: "ali" }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(warn.mock.calls.flat().join(" ")).not.toContain("RUK-251");
    warn.mockRestore();
  });

  /**
   * A standing condition, warned about on every refetch, becomes console noise.
   * `total` stays over the limit for as long as the roster does, so the signal
   * must fire once and then stay quiet — otherwise it is scrolled past, which
   * is exactly the desensitisation SPEC §4.0 diagnoses.
   */
  it("warns once per session, not on every refetch", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    bffFetchMock.mockImplementation(async () => ({ users: CLUSTERED_APPROVERS, total: 3214 }));

    const { result } = renderHook(() => useAssignableUsersQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await result.current.refetch();
    await result.current.refetch();

    const partialSliceWarnings = warn.mock.calls.flat().filter((line) => String(line).includes("RUK-251"));
    expect(partialSliceWarnings).toHaveLength(1);
    warn.mockRestore();
  });

  /**
   * `roles: []` is the nastiest shape: `?? ` only defaults on nullish, so an
   * empty array used to survive, append nothing to the query string, and send a
   * request with NO `roles` — reproducing this PR's bug through the very
   * parameter meant to prevent it. The client filter then rejected every row.
   */
  it("falls back to approver roles when handed an empty roles array", async () => {
    installEndpoint(CLUSTERED);

    const { result } = renderHook(() => useAssignableUsersQuery({ roles: [] }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const query = recordedQueries().find((q) => q.getAll("roles").length > 0);
    // Assert presence first: without this the regression still fails, but on a
    // confusing `undefined !== [...]` instead of "no request carried roles",
    // which is the actual defect being guarded.
    expect(query).toBeDefined();
    expect(query?.getAll("roles")).toEqual(["reviewer", "admin"]);
    expect(result.current.data).not.toHaveLength(0);
    expect(result.current.data?.every((u) => u.roles.some((r) => APPROVER_ROLE_SET.has(r)))).toBe(true);
    // The key must agree with the request: an empty roles segment would claim
    // "no role filter" while holding role-filtered data.
    expect(assignableUsersKey({ roles: [] })).toEqual(assignableUsersKey({}));
  });

  /**
   * A malformed response must degrade to an empty picker with an error state,
   * not throw a TypeError out of the queryFn.
   */
  it("survives a response with no users key", async () => {
    bffFetchMock.mockImplementation(async () => ({ total: 0 }));

    const { result } = renderHook(() => useAssignableUsersQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });

  /**
   * SPEC §2.1 item 4 / §1.4. The approver hook's mock branch projects fields
   * explicitly, so an omitted one silently becomes `undefined` — and
   * `has_messenger_tag` is a TRI-STATE, read as `=== false` by the mentions
   * chips. No test ever entered this branch (only the mentions hook's mock
   * branch was covered), so deleting the field here changed nothing visible.
   * The fix is what made this path reachable again, per §1.4.
   */
  it("derives has_messenger_tag in the mock branch, matching the mentions hook", async () => {
    dataSourceMock.assignableUsers = "mock";
    const { result } = renderHook(() => useAssignableUsersQuery(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.length).toBeGreaterThan(0);
    for (const u of result.current.data ?? []) {
      // Never `undefined`: the projection must carry the key, or mock mode
      // reports "nobody has a messenger handle" for every user.
      expect(typeof u.has_messenger_tag).toBe("boolean");
    }
    // u-1 is an admin with a telegram handle in MOCK_USERS.
    expect(result.current.data?.find((u) => u.id === "u-1")?.has_messenger_tag).toBe(true);
  });

  /**
   * SPEC §4.4 — successor to the disappearing `select`-not-written-back
   * invariant (AC-9, AC-12). The two hooks now own separate cache entries; the
   * approver entry must hold ONLY approvers, and reading `total` inside
   * `queryFn` must not leak into the returned shape, which six call sites index
   * as an array (SPEC §9.4).
   */
  it("keeps the two cache entries separate and returns a bare array (AC-9, AC-12)", async () => {
    installEndpoint(CLUSTERED);
    const { result } = renderHook(
      () => ({ approvers: useAssignableUsersQuery(), mentions: useMentionableUsersQuery() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.approvers.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.mentions.isSuccess).toBe(true));

    expect(queryClient.getQueryCache().getAll()).toHaveLength(2);

    const approverEntry = queryClient.getQueryData<AssignableUser[]>(assignableUsersKey({}));
    expect(approverEntry?.every((u) => u.roles.some((r) => APPROVER_ROLE_SET.has(r)))).toBe(true);
    expect(approverEntry).toHaveLength(CLUSTERED_APPROVERS.length);

    // The mentions entry stays the unfiltered page, guests included.
    const mentionEntry = queryClient.getQueryData<AssignableUser[]>(mentionableUsersKey(""));
    expect(mentionEntry?.some((u) => u.roles.includes("guest"))).toBe(true);

    // AC-12: `total` is read inside `queryFn`; the returned shape stays an array.
    expect(Array.isArray(result.current.approvers.data)).toBe(true);
    expect(Array.isArray(result.current.mentions.data)).toBe(true);
  });
});
