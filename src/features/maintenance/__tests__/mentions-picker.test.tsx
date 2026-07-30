// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AssignableUser, MaintenanceDetail, MaintenanceMention } from "@/domain/maintenance/maintenance";
import { MAX_MENTIONS } from "@/domain/maintenance/mentions";

// jsdom lacks the layout APIs cmdk (the mentions picker) relies on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

/**
 * RUK-218: the maintenance form's Mentions picker. Covers the behaviours that
 * are cheap to get wrong and expensive to notice — the tri-state messenger-tag
 * flag (AC-03/AC-04), the cap (AC-05), hydration from the loaded draft (AC-08),
 * and above all AC-16: chips are MERGED from every source, never filtered over
 * the picker options, so a selected person the picker cannot see still shows up
 * instead of being silently saved or silently cleared.
 */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mentionableData = vi.fn<() => AssignableUser[]>(() => []);
const mentionablePending = vi.fn<() => boolean>(() => false);
// The approver picker shares the `AssignableUser` type — and therefore the new
// `has_messenger_tag` field — so it needs its own controllable data to prove the
// flag stays out of its rendering (AC-17, second clause).
const approverData = vi.fn<() => AssignableUser[]>(() => []);
const createMutate = vi.fn();
const updateMutate = vi.fn();

// TWO user-query mocks are required, not one. `vi.mock` replaces the whole
// module, so mocking only the mentions hook leaves the approver combobox
// importing `useAssignableUsersQuery` from a module that no longer exports it —
// the form then crashes on render, well before any mentions assertion runs.
vi.mock("../queries/use-assignable-users-query", () => ({
  useAssignableUsersQuery: () => ({ data: approverData(), isPending: false }),
}));
vi.mock("../queries/use-mentionable-users-query", () => ({
  useMentionableUsersQuery: () => ({ data: mentionableData(), isPending: mentionablePending() }),
}));
vi.mock("@/features/notify-channels/queries/use-notify-channels-query", () => ({
  useNotifyChannelsQuery: () => ({ data: [], isPending: false }),
}));
vi.mock("@/features/resources/queries/use-resources-query", () => ({
  useResourcesQuery: () => ({ data: { resources: [] }, isPending: false }),
}));
vi.mock("../queries/use-maintenance-draft", () => ({
  useCreateMaintenance: () => ({ mutate: createMutate, isPending: false }),
  useUpdateMaintenance: () => ({ mutate: updateMutate, isPending: false }),
}));
// The form resolves its display/conversion zone via `useTimezone` (→ useMeQuery).
// A ready UTC zone keeps the test off a QueryClient and focused on mentions.
vi.mock("@/features/_shared/timezone/use-timezone", () => ({
  useTimezone: () => ({ zone: "UTC", ready: true }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { MaintenanceEditMode } from "../maintenance-edit-mode";

function user(overrides: Partial<AssignableUser> & { id: string }): AssignableUser {
  return {
    display_name: `User ${overrides.id}`,
    email: `${overrides.id}@example.com`,
    roles: ["editor"],
    ...overrides,
  };
}

/**
 * A draft as the detail read view returns it. `mentions` is passed explicitly
 * (including `undefined`) because its absence is the old-backend signal the form
 * keys off — a default would hide exactly what AC-14 tests.
 */
function draft(mentions: MaintenanceMention[] | undefined): MaintenanceDetail {
  return {
    id: "m-1",
    title: "DB index migration",
    description: "Rebuild the index",
    status: "draft",
    impact: "none",
    scope: "global",
    planned_period: { start: "2099-01-01T10:00:00Z", end: "2099-01-01T11:00:00Z" },
    resources: [],
    // Seeded so the form's own required-field rules (≥1 channel, ≥1 step with a
    // rollback plan and a duration ≥ 5 min) are satisfied and a submit reaches
    // the mutation — otherwise the mentions assertions would pass vacuously,
    // blocked by unrelated validation.
    notify_targets: [{ id: "c-1", name: "maint: events", transport: "telegram" }],
    steps: [
      {
        id: "s-1",
        title: "Rebuild",
        description: "Rebuild the index",
        rollback_description: "Drop the new index",
        duration: "30m",
        status: "pending",
      },
    ],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    actions: {
      can_edit: true,
      can_cancel: true,
      can_approve: false,
      can_start: false,
      can_complete: false,
    },
    conflicts: [],
    reminders: [],
    mentions,
  };
}

function openMentionsPicker() {
  fireEvent.click(screen.getByRole("combobox", { name: "Mentions" }));
}

/** The chip row lives inside the Mentions field, keyed off its remove button. */
function chip(name: string): HTMLElement {
  const remove = screen.getByRole("button", { name: `Remove ${name}` });
  const el = remove.parentElement;
  if (!el) throw new Error(`chip for ${name} has no container`);
  return el;
}

describe("maintenance mentions picker (RUK-218)", () => {
  it("offers a guest, with no role filtering (AC-02)", async () => {
    mentionableData.mockReturnValue([
      user({ id: "u-guest", display_name: "Gina Guest", roles: ["guest"], has_messenger_tag: true }),
    ]);
    render(<MaintenanceEditMode creating onClose={() => undefined} />);
    openMentionsPicker();
    await waitFor(() => expect(screen.getByRole("option", { name: /Gina Guest/ })).toBeTruthy());
  });

  it("dims a person without a messenger tag, warns in the description, and still selects them (AC-03)", async () => {
    mentionableData.mockReturnValue([
      user({ id: "u-1", display_name: "Nora NoTag", email: "nora@example.com", has_messenger_tag: false }),
    ]);
    render(<MaintenanceEditMode creating onClose={() => undefined} />);
    openMentionsPicker();

    // The email is NOT displaced by the warning — it is the only disambiguator
    // between two people sharing a display name.
    const description = await screen.findByText("nora@example.com · No messenger tag — will appear by name");
    expect(description).toBeTruthy();
    // Dimmed label, per the undeliverable-channel precedent in the same form.
    expect(screen.getByText("Nora NoTag").className).toContain("text-fg-muted");

    // Weak binding: the warning informs, it does not block the choice.
    fireEvent.click(screen.getByRole("option", { name: /Nora NoTag/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove Nora NoTag" })).toBeTruthy());
  });

  it("keeps the messenger-tag flag out of the approver picker (AC-17)", async () => {
    // `mapAssignableUser` now carries `has_messenger_tag`, and BOTH pickers read
    // the same `AssignableUser` type — so the flag reaches the approver options
    // too. It must stay invisible there: approver is about who may approve, not
    // about who can be pinged, and a warning triangle would read as a problem
    // with the approver. This pins the second clause of AC-17, which otherwise
    // rests only on the two pickers happening to be separate code today.
    approverData.mockReturnValue([
      user({ id: "a-1", display_name: "Rita Reviewer", roles: ["reviewer"], has_messenger_tag: false }),
    ]);
    render(<MaintenanceEditMode creating onClose={() => undefined} />);

    fireEvent.click(screen.getByRole("combobox", { name: "Approver" }));

    const option = await screen.findByRole("option", { name: /Rita Reviewer/ });
    expect(option.querySelector("svg.lucide-triangle-alert")).toBeNull();
    expect(screen.queryByText(/No messenger tag/)).toBeNull();
    expect(screen.getByText("Rita Reviewer").className).not.toContain("text-fg-muted");
  });

  it("leaves an option whose tag flag is unknown undimmed and unwarned (AC-03)", async () => {
    // No `has_messenger_tag` at all — the shape an older backend (or a caller
    // without `maintenance.create`) produces. `undefined` means "we don't know",
    // so the option must stay neutral: warning here would assert the backend
    // checked and found no handle, on data it never had.
    //
    // This guards the OPTION render path specifically. The AC-04 test below
    // covers the same tri-state rule on the CHIP, and the two are separate
    // render paths — a `=== false` → `!flag` slip in the option builder alone
    // leaves every chip assertion green.
    mentionableData.mockReturnValue([
      user({ id: "u-1", display_name: "Ulla Unknown", email: "ulla@example.com" }),
    ]);
    render(<MaintenanceEditMode creating onClose={() => undefined} />);
    openMentionsPicker();

    const option = await screen.findByRole("option", { name: /Ulla Unknown/ });
    expect(option.querySelector("svg.lucide-triangle-alert")).toBeNull();
    expect(screen.getByText("Ulla Unknown").className).not.toContain("text-fg-muted");
    // The description stays the bare email, with no warning appended.
    expect(screen.getByText("ulla@example.com")).toBeTruthy();
    expect(screen.queryByText(/No messenger tag/)).toBeNull();
  });

  it("marks the chip of a tagless person and leaves an unknown-tag chip unmarked (AC-04)", async () => {
    mentionableData.mockReturnValue([
      user({ id: "u-no", display_name: "Nora NoTag", has_messenger_tag: false }),
      user({ id: "u-yes", display_name: "Tina Tagged", has_messenger_tag: true }),
    ]);
    // `u-unknown` is absent from the options, so `mergeMentionChips` resolves it
    // from the detail with `hasTag: undefined` — "we don't know", not "no tag".
    render(
      <MaintenanceEditMode
        detail={draft([
          { user_id: "u-no", display_name: "Nora NoTag" },
          { user_id: "u-yes", display_name: "Tina Tagged" },
          { user_id: "u-unknown", display_name: "Uma Unknown" },
        ])}
        onClose={() => undefined}
      />,
    );

    // The icon is aria-hidden (the description carries the meaning for AT), so
    // assert on the rendered svg inside each chip.
    expect(chip("Nora NoTag").querySelector("svg.lucide-triangle-alert")).toBeTruthy();
    expect(chip("Tina Tagged").querySelector("svg.lucide-triangle-alert")).toBeNull();
    // The load-bearing half: `undefined` must not warn.
    expect(chip("Uma Unknown").querySelector("svg.lucide-triangle-alert")).toBeNull();
  });

  it("blocks submit past the cap with 'At most 10 people.' (AC-05)", async () => {
    const many = Array.from({ length: 11 }, (_, i) =>
      user({ id: `u-${i}`, display_name: `Person ${i}`, has_messenger_tag: true }),
    );
    mentionableData.mockReturnValue(many);
    render(
      <MaintenanceEditMode
        detail={draft(many.map((u) => ({ user_id: u.id, display_name: u.display_name })))}
        onClose={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(screen.getByText("At most 10 people.")).toBeTruthy());
    // The client re-checks the cap because the backend answers every validation
    // failure with an indistinguishable 400 — so nothing must go out.
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("accepts exactly the cap — the limit is inclusive (AC-05)", async () => {
    // SPEC §1.4: the backend cap is inclusive, so exactly MAX_MENTIONS is legal.
    // Without this boundary case `> MAX_MENTIONS` and `>= MAX_MENTIONS` are
    // indistinguishable to the suite, and the off-by-one would trap the operator
    // in a form that refuses a valid selection with no way to tell the rule wrong.
    const exactly = Array.from({ length: MAX_MENTIONS }, (_, i) =>
      user({ id: `u-${i}`, display_name: `Person ${i}`, has_messenger_tag: true }),
    );
    mentionableData.mockReturnValue(exactly);
    render(
      <MaintenanceEditMode
        detail={draft(exactly.map((u) => ({ user_id: u.id, display_name: u.display_name })))}
        onClose={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateMutate).toHaveBeenCalled());
    expect(screen.queryByText(`At most ${MAX_MENTIONS} people.`)).toBeNull();
    expect(updateMutate.mock.calls[0][0].input.mention_user_ids).toHaveLength(MAX_MENTIONS);
  });

  it("hydrates the picker from detail.mentions, deduplicating (AC-08)", async () => {
    mentionableData.mockReturnValue([
      user({ id: "u-1", display_name: "Ann One", has_messenger_tag: true }),
      user({ id: "u-2", display_name: "Bob Two", has_messenger_tag: true }),
    ]);
    render(
      <MaintenanceEditMode
        detail={draft([
          { user_id: "u-1", display_name: "Ann One" },
          { user_id: "u-2", display_name: "Bob Two" },
          // The unique index makes this unreachable today; the Set on the seed
          // keeps a duplicate from rendering twice and deleting both at once.
          { user_id: "u-1", display_name: "Ann One" },
        ])}
        onClose={() => undefined}
      />,
    );

    expect(screen.getAllByRole("button", { name: "Remove Ann One" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Remove Bob Two" })).toBeTruthy();
    // The trigger summarises the selection: 2 hydrated ids, not 3.
    expect(screen.getByRole("combobox", { name: "Mentions" }).textContent).toContain("2 selected");
  });

  it("distinguishes loading from 'nobody found' in the empty state (AC-12)", async () => {
    mentionableData.mockReturnValue([]);
    mentionablePending.mockReturnValue(true);
    const { unmount } = render(<MaintenanceEditMode creating onClose={() => undefined} />);
    openMentionsPicker();
    await waitFor(() => expect(screen.getByText("Loading…")).toBeTruthy());
    expect(screen.queryByText("No people found.")).toBeNull();
    unmount();

    mentionablePending.mockReturnValue(false);
    render(<MaintenanceEditMode creating onClose={() => undefined} />);
    openMentionsPicker();
    await waitFor(() => expect(screen.getByText("No people found.")).toBeTruthy());
    expect(screen.queryByText("Loading…")).toBeNull();
  });

  it("still renders a chip for a selected id missing from the options (AC-16)", async () => {
    // The realistic case: the person was blocked after the draft was saved (so
    // /users/assignable no longer lists them), or sits beyond the picker's limit.
    mentionableData.mockReturnValue([user({ id: "u-visible", display_name: "Vera Visible" })]);
    render(
      <MaintenanceEditMode
        detail={draft([
          { user_id: "u-visible", display_name: "Vera Visible" },
          { user_id: "u-gone", display_name: "Gone Person" },
        ])}
        onClose={() => undefined}
      />,
    );

    // Name comes from `detail.mentions` — this is why the read path is
    // load-bearing rather than decoration: without it the chip would be a uuid.
    const gone = chip("Gone Person");
    expect(within(gone).getByText("Gone Person")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Vera Visible" })).toBeTruthy();

    // And saving keeps it: an invisible-but-selected id is neither dropped nor,
    // if the operator clears the others, silently hard-deleted unnoticed.
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateMutate).toHaveBeenCalled());
    expect(updateMutate.mock.calls[0][0].input.mention_user_ids).toEqual(["u-visible", "u-gone"]);
  });

  it("hides the field entirely when the backend never sent mentions (AC-14)", async () => {
    mentionableData.mockReturnValue([user({ id: "u-1", display_name: "Ann One" })]);
    const { unmount } = render(<MaintenanceEditMode detail={draft(undefined)} onClose={() => undefined} />);
    // No key means the deploy predates mentions: showing the picker would let
    // the operator tag people the backend accepts with a 200 and discards.
    expect(screen.queryByRole("combobox", { name: "Mentions" })).toBeNull();
    unmount();

    // An empty array is the opposite signal — supported, nobody tagged.
    render(<MaintenanceEditMode detail={draft([])} onClose={() => undefined} />);
    expect(screen.getByRole("combobox", { name: "Mentions" })).toBeTruthy();
  });
});
