// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AssignableUser } from "@/domain/maintenance/maintenance";
import type { NotifyChannel } from "@/domain/notify-channel/notify-channel";

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

// Resources, mutations and timezones stay stubbed — this file is about pickers.
//
// Channels are the exception: RUK-268 gave that picker the same three-state
// treatment, so its mock is DRIVEN rather than frozen — three accessors the
// cases set individually.
//
// The factory default is a floor for the FIRST case, not a reset between cases.
// `afterEach` runs `vi.clearAllMocks()`, which clears call history and leaves
// both `mockImplementation` and `mockReturnValue` in place — probed against this
// repo's Vitest rather than assumed. So the hazard is a neighbour's value
// leaking forward, and the only thing that prevents it is every case setting all
// three explicitly, which they do.
const channelsData = vi.fn<() => NotifyChannel[]>(() => []);
const channelsPending = vi.fn<() => boolean>(() => false);
const channelsError = vi.fn<() => boolean>(() => false);
vi.mock("@/features/notify-channels/queries/use-notify-channels-query", () => ({
  useNotifyChannelsQuery: () => ({
    data: channelsData(),
    isPending: channelsPending(),
    isError: channelsError(),
  }),
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

    // Scoped to the open popover, not `screen`. Under a blanket rejection this
    // sentence is rendered by FOUR nodes — visibly in each picker's
    // `CommandEmpty` and again in each one's `sr-only` live region (mentions
    // since RUK-253, approver since RUK-269). A document-wide
    // `getAllByText(...).length > 0` would therefore stay green on the mentions
    // nodes alone, and so would no longer be an assertion about the approver at
    // all: verified by mutation — changing only the approver's string left it
    // passing. A strict `getByText` is equally wrong, failing on a neighbour's
    // node rather than on anything this test is about.
    const popover = await screen.findByRole("listbox");
    await waitFor(() =>
      expect(within(popover).getByText("Couldn't load people. Retry or check your access.")).toBeTruthy(),
    );
    expect(within(popover).queryByText("No people found.")).toBeNull();
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

    // `getAllByText` for the same reason as the case above — and, once RUK-269
    // lands, for one more: the approver `Combobox` renders this sentence into
    // its own sr-only live region too, so even a run where ONLY the approver
    // request failed matches two nodes.
    await waitFor(() =>
      expect(screen.getAllByText("Couldn't load people. Retry or check your access.").length).toBeGreaterThan(
        0,
      ),
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

  /**
   * RUK-270, and the only case that proves the point the fix is FOR.
   *
   * The guards in both roster hooks are justified by a claim about what the
   * operator reads — "Couldn't load people." rather than "No people found." —
   * and until this case existed nothing asserted it. The hook tests stop at
   * `isError`, which is the mechanism, not the contract: RUK-253's whole
   * argument is about which SENTENCE renders.
   *
   * A malformed 200 is a different path to that sentence than the 403 above.
   * It resolves successfully at the transport layer, so it reaches the picker
   * as data rather than as a rejection — which is exactly how it used to be
   * laundered into "No people found." Reverting either hook guard fails this.
   */
  it("reads a malformed 200 as a failed load, not as an empty roster (RUK-270)", async () => {
    bffFetchMock.mockResolvedValue({ total: 0 });
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

    // 2b. And the two attributes that make it a live region at all. Every
    //     assertion here reaches the node by testid, which does not care about
    //     them, so deleting either left the entire suite green — the same
    //     silent-revert shape as the `sr-only` swap above, found later.
    expect(live.getAttribute("role")).toBe("alert");
    expect(live.getAttribute("aria-live")).toBe("assertive");

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

/**
 * RUK-268 — the third and last picker with this defect.
 *
 * These cases are HOOK-level, unlike everything above: `useNotifyChannelsQuery`
 * is mocked at module scope (see the accessors at the top), so they drive query
 * state directly rather than through `bffFetch`. That is deliberate. The
 * `bffFetch`-over-real-hooks arrangement exists to answer one question — which
 * of two hooks sharing an endpoint a branch reads — and the channels query
 * shares an endpoint with nothing, so it has no such question to answer.
 *
 * Every case OPENS the picker. The live region renders
 * `{open && errorText ? errorText : ""}` (`multi-select.tsx:150`), so a
 * closed-picker assertion reads `""` in every state — three green cases proving
 * nothing.
 *
 * Each case sets all three accessors explicitly. The suite is order-independent
 * by construction rather than by luck: RUK-253 split a three-state test and
 * immediately found the second half had been relying on the first to reset a
 * flag.
 */
describe("channels picker distinguishes a failed load from an empty catalog (RUK-268)", () => {
  const ERROR_TEXT = "Couldn't load channels. Retry or check your access.";
  const LIVE_REGION = "multiselect-error-live-notify-channels";

  function openChannels() {
    fireEvent.click(screen.getByRole("combobox", { name: "Notify channels" }));
  }

  it("renders the error string, not 'No channels configured.' (AC-1)", async () => {
    channelsData.mockImplementation(() => []);
    channelsPending.mockImplementation(() => false);
    channelsError.mockImplementation(() => true);
    renderForm();
    openChannels();

    // Scoped to the open popover, so this is an assertion about the VISIBLE
    // copy. A document-wide `getAllByText(...).length > 0` would be satisfied by
    // the sr-only live region alone — the visible string could then be changed
    // to anything, "Loading…" included, and this would stay green. Verified by
    // mutation; the same weakness cost the approver case a real hole.
    const popover = await screen.findByRole("listbox");
    await waitFor(() => expect(within(popover).getByText(ERROR_TEXT)).toBeTruthy());
    expect(within(popover).queryByText("No channels configured.")).toBeNull();
  });

  it("still says 'No channels configured.' when the catalog is genuinely empty (AC-2)", async () => {
    channelsData.mockImplementation(() => []);
    channelsPending.mockImplementation(() => false);
    channelsError.mockImplementation(() => false);
    renderForm();
    openChannels();

    await waitFor(() => expect(screen.getByText("No channels configured.")).toBeTruthy());
    expect(screen.queryByText(/Couldn't load channels/)).toBeNull();
  });

  it("announces the failure to assistive tech (AC-3a)", async () => {
    channelsData.mockImplementation(() => []);
    channelsPending.mockImplementation(() => false);
    channelsError.mockImplementation(() => true);
    renderForm();
    openChannels();

    await waitFor(() => expect(screen.getByTestId(LIVE_REGION).textContent).toBe(ERROR_TEXT));
  });

  /**
   * The invariant that is easiest to get wrong, and was got wrong once on
   * RUK-253: a failed query that is REFETCHING reports `isPending` and `isError`
   * together. `emptyText` gives pending precedence, so an `errorText` gated on
   * `isError` alone makes the popover read "Loading…" while the live region
   * announces a failure — the two audiences told different things about the same
   * moment.
   */
  it("stays silent while a failed query is refetching (AC-3b)", async () => {
    channelsData.mockImplementation(() => []);
    channelsPending.mockImplementation(() => true);
    channelsError.mockImplementation(() => true);
    renderForm();
    openChannels();

    // Prove the popover really reached the pending state before asserting on
    // the silence — otherwise this passes for a moment that never happened.
    await waitFor(() => expect(screen.getByText("Loading…")).toBeTruthy());
    expect(screen.getByTestId(LIVE_REGION).textContent).toBe("");
  });

  it("stays silent when the catalog is merely empty (AC-3c)", async () => {
    channelsData.mockImplementation(() => []);
    channelsPending.mockImplementation(() => false);
    channelsError.mockImplementation(() => false);
    renderForm();
    openChannels();

    await waitFor(() => expect(screen.getByText("No channels configured.")).toBeTruthy());
    expect(screen.getByTestId(LIVE_REGION).textContent).toBe("");
  });
});

/**
 * RUK-269 — the approver picker's live region.
 *
 * jsdom has no live-region semantics, so nothing here proves an utterance; the
 * announcement itself is checked by hand against VoiceOver's caption panel.
 * What IS checkable is the arrangement that makes announcing possible, and each
 * of these failure modes is precise enough to pin:
 *
 * - a region rendered inside `PopoverContent` enters the DOM with its text
 *   already in place, and a live region announces mutations rather than
 *   arrivals. It would be silent while satisfying any "is the node there after
 *   I open the picker" assertion — hence the first case asserts the region is
 *   present and EMPTY while the picker is still closed, and the second that the
 *   text arrived by mutating that same still-attached node.
 * - `sr-only` swapped for `hidden` silently reverts the whole feature:
 *   `display:none` removes the node from the accessibility tree, and a hidden
 *   live region announces nothing, ever. Every structural assertion still
 *   passes. That mutation survived 1126 tests on RUK-253 until its ship step.
 * - a region that never clears has no empty→text transition to announce on a
 *   second open, so the picker goes quiet exactly when the user looks again.
 *
 * The approver `Combobox` makes the open/close pair more load-bearing than it
 * was for `MultiSelect`, not less: `combobox.tsx` calls `setOpen(false)` on
 * select, while `MultiSelect` deliberately stays open across toggles.
 */
describe("approver picker announces a failed load to assistive tech (RUK-269)", () => {
  const ERROR_TEXT = "Couldn't load people. Retry or check your access.";
  const LIVE_REGION = "combobox-error-live-approver";

  const openApprover = () => fireEvent.click(screen.getByRole("combobox", { name: "Approver" }));

  it("keeps the region mounted and empty until the picker opens (AC-4a)", async () => {
    bffFetchMock.mockRejectedValue(new Error("403 forbidden"));
    renderForm();

    // Present before any interaction — this is what makes the later text a
    // mutation rather than an arrival.
    const live = screen.getByTestId(LIVE_REGION);
    expect(live.textContent).toBe("");

    // And still empty AFTER the query has settled into failure. Without this
    // the case would pass on a component whose request had not yet resolved,
    // proving only that the node starts empty rather than that it stays empty
    // until the picker is opened.
    await waitFor(() => expect(bffFetchMock).toHaveBeenCalled());
    expect(live.textContent).toBe("");
  });

  it("delivers the text by mutating that same node (AC-4b)", async () => {
    bffFetchMock.mockRejectedValue(new Error("403 forbidden"));
    renderForm();
    const live = screen.getByTestId(LIVE_REGION);
    openApprover();

    await waitFor(() => expect(live.textContent).toBe(ERROR_TEXT));
    // Identity, not just content: the same element the assertion above held
    // before the failure landed.
    expect(screen.getByTestId(LIVE_REGION)).toBe(live);
  });

  it("keeps the region announceable: sr-only, role=alert, aria-live (AC-4c)", async () => {
    bffFetchMock.mockRejectedValue(new Error("403 forbidden"));
    renderForm();
    openApprover();

    await waitFor(() => expect(screen.getByTestId(LIVE_REGION).textContent).toBe(ERROR_TEXT));
    const live = screen.getByTestId(LIVE_REGION);

    // The class string, not computed style: jsdom does not compute Tailwind.
    // `sr-only` is the clip-rect idiom that keeps a node readable by AT;
    // `hidden` would remove it and silence the region while every other
    // assertion in this file still passed.
    expect(live.className).toContain("sr-only");

    // The two attributes that make it a live region AT ALL. Every other test
    // here reaches the node by testid, which is indifferent to them — so
    // without these, deleting either left the whole suite green while removing
    // the announcement this feature exists to produce. `aria-live` is the more
    // likely casualty: the component's own comment calls it redundant to
    // `role="alert"`, which is exactly the kind of note that invites a tidy-up.
    expect(live.getAttribute("role")).toBe("alert");
    expect(live.getAttribute("aria-live")).toBe("assertive");
  });

  it("clears on close so a re-open announces again (AC-5a)", async () => {
    bffFetchMock.mockRejectedValue(new Error("403 forbidden"));
    renderForm();
    const live = screen.getByTestId(LIVE_REGION);

    openApprover();
    await waitFor(() => expect(live.textContent).toBe(ERROR_TEXT));

    // Close: the text must go, or the second open has no empty→text transition
    // to announce and the picker is silent exactly when the user looks again.
    openApprover();
    await waitFor(() => expect(live.textContent).toBe(""));

    openApprover();
    await waitFor(() => expect(live.textContent).toBe(ERROR_TEXT));
  });

  /**
   * The `open` gate, isolated from the clearing behaviour AC-5a covers.
   *
   * AC-5a walks open→close→open on ONE mounted component, so a region that
   * merely reset on unmount would satisfy it. This case never opens the picker
   * at all: the query is left to fail against a freshly mounted form, and the
   * region must stay empty anyway. That is the half with the user cost — an
   * ungated region announces a failure to someone filling in an unrelated
   * field, before they have shown any interest in this one.
   */
  it("stays silent while the picker was never opened (AC-5b)", async () => {
    bffFetchMock.mockRejectedValue(new Error("403 forbidden"));
    renderForm();
    const live = screen.getByTestId(LIVE_REGION);

    // The query must actually reach `isError`, or this passes for the trivial
    // reason that nothing has happened yet. Proven via a SECOND picker: the
    // mentions region shares the rejection and is opened, so its text arriving
    // is evidence the failure landed while the approver stayed shut.
    fireEvent.click(screen.getByRole("combobox", { name: "Mentions" }));
    await waitFor(() =>
      expect(screen.getByTestId("multiselect-error-live-mentions").textContent).toBe(ERROR_TEXT),
    );

    expect(live.textContent).toBe("");
  });
});
