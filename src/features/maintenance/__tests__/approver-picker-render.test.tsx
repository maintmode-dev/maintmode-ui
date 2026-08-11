// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AssignableUser } from "@/domain/maintenance/maintenance";

/**
 * SPEC §4.3 / AC-1 — the only test that asks the user's question.
 *
 * §4.0 diagnosed the gap: every existing test asserted a MECHANISM (how many
 * requests, what shape the key has, whether `select` writes back) and none
 * asserted the OUTCOME — is there anything in the approver picker to click.
 * Worse, the two "isolated" form tests hardcode `data: []` for this hook, so
 * they render the bug itself as their fixture and pass.
 *
 * So this file deliberately does NOT `vi.mock` the user-query hooks. It mounts
 * the real hooks on a real QueryClient over a `bffFetch` that models the
 * endpoint the way SPEC §4.2 does — filter first, slice second, missing `limit`
 * means 50 — and then opens the combobox and looks.
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
const INTERLEAVED_APPROVER_COUNT = INTERLEAVED_ROSTER.filter((u) =>
  u.roles.includes("reviewer"),
).length;

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

    await waitFor(() =>
      expect(screen.getByText("Couldn't load people. Retry or check your access.")).toBeTruthy(),
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
