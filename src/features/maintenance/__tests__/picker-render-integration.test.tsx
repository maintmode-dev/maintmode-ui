// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AssignableUser } from "@/domain/maintenance/maintenance";

/**
 * Render-integration tests for the form's user pickers — approver AND mentions.
 *
 * The file is named for its MECHANISM, not its subject: it deliberately does
 * NOT `vi.mock` the user-query hooks. It mounts the real hooks on a real
 * QueryClient over a mocked `bffFetch`, which is the only arrangement in which
 * one picker's request can fail while the other's succeeds. Three picker test
 * files exist (`mentions-picker`, `channel-picker-status`, this one); a
 * subject-shaped name here would claim a space it does not cover and would let
 * the next author pick this file by topic and silently inherit its
 * module-level `DATA_SOURCE` mock.
 *
 * Approver half (SPEC §4.3 / AC-1 of the approver spec) — §4.0 there diagnosed
 * the gap: every existing test asserted a MECHANISM (how many requests, what
 * shape the key has, whether `select` writes back) and none asserted the
 * OUTCOME — is there anything in the approver picker to click. Worse, the two
 * "isolated" form tests hardcode `data: []` for this hook, so they render the
 * bug itself as their fixture and pass. The `bffFetch` mock models the endpoint
 * the way that spec's §4.2 does — filter first, slice second, missing `limit`
 * means 50 — and then opens the combobox and looks.
 *
 * Mentions half (RUK-253 SPEC §7.1) — the same defect reached the mentions
 * picker, whose own test file mocks the hooks and therefore cannot prove WHICH
 * hook the component read. That proof lives here.
 *
 * Per-test docblocks below citing bare "SPEC §…" refer to the approver spec;
 * mentions cases cite "RUK-253 SPEC §…" explicitly.
 */

// jsdom lacks the layout APIs cmdk relies on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

const BACKEND_DEFAULT_LIMIT = 50;

const bffFetchMock = vi.fn();
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (...args: unknown[]) => bffFetchMock(...args) };
});
vi.mock("@/features/_shared/api/data-source", () => ({ DATA_SOURCE: { assignableUsers: "bff" } }));

// Everything that is not the approver picker stays stubbed — this test is about
// one combobox, not about channels, resources, mutations or timezones.
vi.mock("@/features/notify-channels/queries/use-notify-channels-query", () => ({
  useNotifyChannelsQuery: () => ({ data: [], isPending: false, isError: false }),
}));
vi.mock("@/features/resources/queries/use-resources-query", () => ({
  useResourcesQuery: () => ({ data: { resources: [] }, isPending: false, isError: false }),
}));
vi.mock("../queries/use-maintenance-draft", () => ({
  useCreateMaintenance: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateMaintenance: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/features/_shared/timezone/use-timezone", () => ({
  useTimezone: () => ({ zone: "UTC", ready: true }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { MaintenanceEditMode } from "../maintenance-edit-mode";

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
 * The local-seed shape (SPEC §1.2): the first 200 rows are guests, every
 * approver sorts after them. Under the old client-side filter this rendered
 * "No people found." — the reported P0.
 */
const ROSTER: AssignableUser[] = Array.from({ length: 250 }, (_, i) =>
  user(i, i < 200 ? ["guest"] : ["reviewer"]),
);

/**
 * The PRODUCTION shape (SPEC §0.1): approvers scattered through the roster
 * because the sort is `display_name ASC` and role plays no part. Here the bug is
 * SILENT — a client-side filter over the first 200 rows renders 5 of these 7
 * approvers, so the picker looks perfectly healthy while quietly hiding people.
 *
 * `ROSTER` above cannot catch that: its approvers all sort past the boundary, so
 * the same defect renders an empty list and any `length > 0` check fires. Every
 * assertion here is therefore an EXACT count — demonstrated necessary, since
 * truncating `approverOptions` to 5 rows in the component left 120 tests green.
 */
const INTERLEAVED_ROSTER: AssignableUser[] = Array.from({ length: 250 }, (_, i) =>
  user(i, i % 40 === 0 ? ["reviewer"] : ["guest"]),
);
const INTERLEAVED_APPROVER_COUNT = INTERLEAVED_ROSTER.filter((u) => u.roles.includes("reviewer")).length;

/** Query string of a requested `bffFetch` path. */
function queryOf(path: unknown): URLSearchParams {
  return new URLSearchParams(String(path).split("?")[1] ?? "");
}

let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  bffFetchMock.mockReset();
  installRoster(ROSTER);
});

/**
 * Models the endpoint over `roster`: filter by `roles` FIRST, truncate to
 * `limit` SECOND. A missing `limit` means the backend default of 50, not
 * "unbounded" (SPEC §1.1 row 3).
 */
function installRoster(roster: AssignableUser[]) {
  bffFetchMock.mockImplementation(async (path: string) => {
    const query = queryOf(path);
    const roles = query.getAll("roles");
    const rawLimit = query.get("limit");
    const limit = rawLimit ? Number(rawLimit) : BACKEND_DEFAULT_LIMIT;
    const filtered = roles.length ? roster.filter((u) => u.roles.some((r) => roles.includes(r))) : roster;
    return { users: filtered.slice(0, limit), total: filtered.length };
  });
}

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.clearAllMocks();
});

function renderForm() {
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(MaintenanceEditMode, { creating: true, onClose: () => undefined }) as ReactNode,
    ),
  );
}

describe("approver picker renders real approvers (SPEC §4.3, AC-1)", () => {
  it("offers at least one approver and does not say 'No people found.'", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("combobox", { name: "Approver" }));

    // The user-facing assertion this suite never made.
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
    expect(screen.queryByText("No people found.")).toBeNull();

    // Named, not just counted: `Person 200` is the first approver and sits
    // beyond the 200-row unfiltered page, so it is reachable only if `roles`
    // went to the server.
    expect(await screen.findByRole("option", { name: /Person 200/ })).toBeTruthy();
  });

  /**
   * The SILENT production case, asserted by EXACT count.
   *
   * Everything else in this file leans on the local-seed roster, where the bug
   * empties the list — so `length > 0` fires. On a production-shaped roster the
   * same defect renders 5 of 7 approvers and every one of those assertions
   * passes. Only a count catches it.
   *
   * Necessity demonstrated: truncating `approverOptions` to 5 rows in
   * `maintenance-edit-mode.tsx` left all 120 tests green before this existed.
   * Nothing between `assignable.data` and the rendered list was pinned, which is
   * the same blindness — one layer up — that the hook tests closed.
   */
  it("renders every approver on a production-shaped roster, not a plausible subset", async () => {
    installRoster(INTERLEAVED_ROSTER);
    renderForm();
    fireEvent.click(screen.getByRole("combobox", { name: "Approver" }));

    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
    expect(INTERLEAVED_APPROVER_COUNT).toBe(7);
    expect(screen.getAllByRole("option")).toHaveLength(INTERLEAVED_APPROVER_COUNT);
    // Index 240 survives only if `roles` reached the server: a client-side
    // filter over the first 200 rows stops at index 160.
    expect(screen.getByRole("option", { name: /Person 240/ })).toBeTruthy();
  });

  it("offers no guest as an approver", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("combobox", { name: "Approver" }));

    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
    // `Person 000` is a guest and leads the unfiltered roster — the row that
    // filled the picker's first page under the bug.
    expect(screen.queryByRole("option", { name: /Person 000/ })).toBeNull();
  });

  /**
   * AC-10 / SPEC §2.2. A failed load must not read as "this company has no
   * approvers". Before the fix `isError` was unread and 403 (the endpoint is
   * permission gated — the normal answer for a guest, SPEC §1.3) was
   * indistinguishable from an empty roster.
   */
  it("distinguishes a failed load from an empty roster", async () => {
    bffFetchMock.mockRejectedValue(new Error("403 forbidden"));
    renderForm();
    fireEvent.click(screen.getByRole("combobox", { name: "Approver" }));

    // `getAllByText`, not `getByText`: the mentions picker now renders this same
    // sentence into its own `sr-only` live region, so a strict single-match
    // query here would fail on the neighbour's node rather than on anything
    // this test is about.
    await waitFor(() =>
      expect(screen.getAllByText("Couldn't load people. Retry or check your access.").length).toBeGreaterThan(
        0,
      ),
    );
    expect(screen.queryByText("No people found.")).toBeNull();
  });

  it("still says 'No people found.' when the roster is genuinely empty", async () => {
    bffFetchMock.mockResolvedValue({ users: [], total: 0 });
    renderForm();
    fireEvent.click(screen.getByRole("combobox", { name: "Approver" }));

    await waitFor(() => expect(screen.getByText("No people found.")).toBeTruthy());
    expect(screen.queryByText(/Couldn't load people/)).toBeNull();
  });

  /**
   * Pins WHICH query the error branch reads. Both pickers hit the same endpoint,
   * so `assignable.isError` and `mentionable.isError` are interchangeable to the
   * type checker and usually move together — but only usually. The fix gave the
   * two hooks independent cache lifecycles precisely so they can now diverge
   * (SPEC §2.2, §2.5), which makes "in approvers it failed, in mentions it did
   * not" a REACHABLE state rather than a theoretical one. Reading the wrong hook
   * there restores the original defect — a failed approver load rendering as "No
   * people found." — and every other test in this file passes anyway, because in
   * all of them both requests share a fate.
   */
  it("reads the error state from the approver query, not the mentions query", async () => {
    bffFetchMock.mockImplementation(async (path: string) => {
      const roles = queryOf(path).getAll("roles");
      // Only the approver request fails — the mentions one succeeds beside it.
      if (roles.length > 0) throw new Error("403 forbidden");
      return { users: ROSTER, total: ROSTER.length };
    });
    renderForm();
    fireEvent.click(screen.getByRole("combobox", { name: "Approver" }));

    await waitFor(() =>
      expect(screen.getByText("Couldn't load people. Retry or check your access.")).toBeTruthy(),
    );
    expect(screen.queryByText("No people found.")).toBeNull();
  });
});

/**
 * RUK-253 — the same defect in the mentions picker.
 *
 * The mentions picker's own suite (`mentions-picker.test.tsx`) mocks the query
 * HOOKS, so it can drive `isError` but can never prove which hook the component
 * read: the mock, not the component, decides what each hook returns. These
 * cases mount the real hooks, so the two requests can be given different fates.
 *
 * The error sentence is asserted with `getAllByText`, not `getByText`: it is
 * rendered TWICE by design — once visibly in cmdk's `CommandEmpty` and once in
 * the `sr-only` live region that carries it to assistive tech (RUK-253 SPEC
 * §5.1.1, R7). A `getByText` here would throw on multiple matches the moment
 * the live region lands.
 */
describe("mentions picker distinguishes a failed load from an empty roster (RUK-253)", () => {
  const ERROR_TEXT = "Couldn't load people. Retry or check your access.";

  function openMentions() {
    fireEvent.click(screen.getByRole("combobox", { name: "Mentions" }));
  }

  it("distinguishes a failed load from an empty roster (AC-1)", async () => {
    bffFetchMock.mockRejectedValue(new Error("403 forbidden"));
    renderForm();
    openMentions();

    await waitFor(() => expect(screen.getAllByText(ERROR_TEXT).length).toBeGreaterThan(0));
    expect(screen.queryByText("No people found.")).toBeNull();
  });

  it("still says 'No people found.' when the roster is genuinely empty (AC-2)", async () => {
    bffFetchMock.mockResolvedValue({ users: [], total: 0 });
    renderForm();
    openMentions();

    await waitFor(() => expect(screen.getByText("No people found.")).toBeTruthy());
    expect(screen.queryAllByText(ERROR_TEXT)).toHaveLength(0);
  });

  /**
   * AC-3 — the load-bearing case, and the ONLY one here that discriminates
   * between the two hooks.
   *
   * Both pickers hit the same endpoint, so `mentionable.isError` and
   * `assignable.isError` are interchangeable to the type checker and move
   * together in every test where both requests share a fate — including the
   * AC-1 case above, which rejects everything and therefore stays green even
   * with the wrong hook wired in. Reading `assignable` here would restore the
   * original defect silently.
   *
   * That divergence is reachable in production, not theoretical: the two hooks
   * own distinct cache keys (`mentionable-users` vs `assignable-users`,
   * deliberately) and issue separate requests, so one can fail while the other
   * succeeds (RUK-253 SPEC §1.4).
   *
   * The mock is installed in full rather than layered over `beforeEach`'s
   * `installRoster`, which resolves everything. Its `roles`-absent branch is a
   * NEGATIVE predicate, so the explicit throw keeps it self-reporting: any
   * future request routed through `bffFetch` that also omits `roles` fails
   * loudly here instead of quietly being served the mentions rejection.
   */
  it("reads the error state from the mentions query, not the approver query (AC-3)", async () => {
    bffFetchMock.mockImplementation(async (path: string) => {
      if (!String(path).startsWith("/api/users/assignable")) {
        throw new Error(`unexpected request: ${String(path)}`);
      }
      // Only the mentions request fails — the approver one succeeds beside it.
      // Mirror image of the approver-side twin above, which fails the request
      // that HAS `roles`.
      const roles = queryOf(path).getAll("roles");
      if (roles.length === 0) throw new Error("403 forbidden");
      return { users: ROSTER, total: ROSTER.length };
    });
    renderForm();
    openMentions();

    await waitFor(() => expect(screen.getAllByText(ERROR_TEXT).length).toBeGreaterThan(0));
    expect(screen.queryByText("No people found.")).toBeNull();
  });

  /**
   * AC-4 — the live region has the STRUCTURE that announces.
   *
   * This case cannot prove a screen reader speaks: jsdom has no live-region
   * semantics, and no test in this repo can observe an announcement. The
   * announcement itself is verified by hand against VoiceOver's caption panel.
   * What IS checkable is the arrangement that makes announcing possible, and
   * the failure mode is specific enough to pin: a live region rendered inside
   * `PopoverContent` enters the DOM with its text already in place, and a
   * region announces mutations, not arrivals. Such a region passes any
   * "is the node there once I open the picker" assertion while being silent.
   *
   * Hence assertion 1 — present and EMPTY while the picker is still closed —
   * which is the one an in-popover region fails. Assertion 2 then proves the
   * text arrived as a mutation of that very node rather than with a new one.
   */
  it("keeps the live region mounted and empty until the failure lands (AC-4)", async () => {
    bffFetchMock.mockRejectedValue(new Error("403 forbidden"));
    renderForm();

    // 1. Mounted before the text — the assertion an in-popover region fails.
    const live = screen.getByTestId("multiselect-error-live-mentions");
    expect(live.textContent).toBe("");

    // 2. Hidden VISUALLY but not from assistive tech. `sr-only` is the clip-rect
    //    idiom that keeps a node in the accessibility tree; `hidden`
    //    (`display: none`) removes it, and a display:none live region announces
    //    nothing, ever. That one-word swap leaves every other assertion in this
    //    file passing — the node still mounts, still stays empty, still mutates
    //    — so without this line the whole feature reverts silently. jsdom does
    //    not compute the Tailwind class, hence asserting the class itself, as
    //    the dimming rule is pinned in `mentions-picker.test.tsx`.
    expect(live.className).toContain("sr-only");
    expect(live.className).not.toContain("hidden");

    // 3. The text arrives by MUTATING that same node, still attached.
    openMentions();
    await waitFor(() => expect(live.textContent).toBe(ERROR_TEXT));
    expect(live.isConnected).toBe(true);
    expect(screen.getByTestId("multiselect-error-live-mentions")).toBe(live);
  });

  /**
   * R8's "re-opening a still-broken picker announces again". A live region
   * announces MUTATIONS, so a second look only speaks if the text was cleared
   * on close — otherwise there is no empty→text transition left to announce and
   * the picker goes quiet exactly when the user checks again.
   *
   * Unpinned before this case: both AC-4 cases stop at the first open, so a
   * "sticky latch" (set the text once, never clear it) passed the whole suite
   * while breaking this property.
   */
  it("clears the region on close so a re-open announces again (AC-4, R8)", async () => {
    bffFetchMock.mockRejectedValue(new Error("403 forbidden"));
    renderForm();

    const live = screen.getByTestId("multiselect-error-live-mentions");
    openMentions();
    await waitFor(() => expect(live.textContent).toBe(ERROR_TEXT));

    openMentions(); // close — the text must go, or the re-open below is silent
    await waitFor(() => expect(live.textContent).toBe(""));

    openMentions();
    await waitFor(() => expect(live.textContent).toBe(ERROR_TEXT));
  });

  /**
   * AC-4 / R8's harder half: the region stays silent while the picker is CLOSED,
   * even though the request has already failed and `errorText` is being passed.
   *
   * The case above cannot pin this — there the popover is closed only before the
   * query has settled, so an ungated region would be empty anyway for want of a
   * message. Here the failure is allowed to land first, so the only thing
   * keeping the node empty is the `open` gate itself.
   *
   * What it protects: Mentions is optional. A region live from form-render
   * onward would announce a mentions failure to someone filling in an unrelated
   * part of the form, which is worse than the silence it replaces. Opening the
   * picker is the user asking "who is available"; that is when the answer "we
   * could not find out" is wanted.
   */
  it("stays silent while the picker is closed, even after the load has failed (AC-4, R8)", async () => {
    bffFetchMock.mockRejectedValue(new Error("403 forbidden"));
    renderForm();

    const live = screen.getByTestId("multiselect-error-live-mentions");

    // The query must be PROVEN to have settled into `isError`, not merely to
    // have been issued — otherwise the silence below is explained by "no message
    // exists yet" and this case collapses into the one above it. Opening once
    // and seeing the text is that proof; nothing observable outside the popover
    // distinguishes a failed load from a pending one.
    openMentions();
    await waitFor(() => expect(live.textContent).toBe(ERROR_TEXT));

    // Now close it. The failure is still live in the cache, `errorText` is still
    // being passed — and the region must fall silent anyway. The `open` gate is
    // the only thing that can do that.
    openMentions();
    await waitFor(() => expect(live.textContent).toBe(""));
  });

  it("keeps the live region silent when the roster is merely empty (AC-4, R8)", async () => {
    bffFetchMock.mockResolvedValue({ users: [], total: 0 });
    renderForm();
    openMentions();

    // The visible copy appears; nothing is announced. "Nobody to tag" is not
    // news — the listbox being empty already says it.
    await waitFor(() => expect(screen.getByText("No people found.")).toBeTruthy());
    expect(screen.getByTestId("multiselect-error-live-mentions").textContent).toBe("");
  });
});
