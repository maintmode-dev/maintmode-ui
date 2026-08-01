// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/domain/admin/user";
import type { MaintenanceDetail } from "@/domain/maintenance/maintenance";

// jsdom lacks the layout APIs the form's cmdk/popover children rely on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

/**
 * RUK-233 AC-10: opening Edit shows the draft's start as wall-clock in the
 * viewer's zone — and keeps doing so after the provider adopts the
 * authoritative zone post-mount.
 *
 * WHY THIS FILE MOCKS `useMeQuery` AND NOT `useTimezone` — do not "simplify"
 * this: every sibling suite stubs `useTimezone` with a constant
 * (`{ zone: "UTC", ready: true }`), which is exactly what makes them unable to
 * guard the thing under test here. `maintenance-edit-mode.tsx` re-seeds `start`
 * from a `useEffect` keyed on `zone` (`:142-146`) rather than from a `useState`
 * initializer, precisely so a zone that arrives AFTER the first render still
 * corrects the field. Under a constant `useTimezone` stub the zone never
 * changes, so moving that seed into `useState` produces byte-identical output
 * and the regression passes unnoticed. So here the REAL `TimezoneProvider` and
 * the REAL `useTimezone` run, and the seam is pushed one level down to
 * `useMeQuery` — the provider's only input besides its `serverZone` prop
 * (precedent: `calendar/__tests__/calendar-write-gate.test.tsx:46-48`).
 *
 * That buys the asymmetric pair below. 10a is the letter of AC-10 (cookie zone
 * equals `me.timezone`, so `zone` never changes and the effect is invisible);
 * 10b is the one with teeth (`serverZone={null}` → first frame is the UTC
 * fallback, Nicosia only post-mount), so a lost re-seed sticks at `10:00`.
 */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const meData = vi.fn<() => Partial<User> | undefined>(() => undefined);
vi.mock("@/features/_shared/queries/use-me-query", () => ({
  useMeQuery: () => ({ data: meData() }),
}));

// The remaining mocks only keep the form off the network: it mounts an approver
// combobox, a mentions picker, a channel picker and a resource picker, each with
// its own query hook, and any unmocked one needs a QueryClient the provider is
// deliberately NOT wrapped in here (see the file header — `useMeQuery` is the
// only query seam this test wants).
vi.mock("../queries/use-assignable-users-query", () => ({
  useAssignableUsersQuery: () => ({ data: [], isPending: false }),
}));
vi.mock("../queries/use-mentionable-users-query", () => ({
  useMentionableUsersQuery: () => ({ data: [], isPending: false }),
}));
vi.mock("@/features/notify-channels/queries/use-notify-channels-query", () => ({
  useNotifyChannelsQuery: () => ({ data: [], isPending: false }),
}));
vi.mock("@/features/resources/queries/use-resources-query", () => ({
  useResourcesQuery: () => ({ data: { resources: [] }, isPending: false }),
}));
vi.mock("../queries/use-maintenance-draft", () => ({
  useCreateMaintenance: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateMaintenance: () => ({ mutate: vi.fn(), isPending: false }),
}));
// `usePathname` is needed by the real `TimezoneProvider` rendered below: it skips
// the `/api/me` query on public paths (that 401 would bounce to `/login`). An
// auth-gated path is what these cases are about, so the saved zone is consulted.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/maintenance/1",
}));

import { TimezoneProvider } from "@/features/_shared/timezone/timezone-provider";
import { MaintenanceEditMode } from "../maintenance-edit-mode";

/** The zone under test. January in Nicosia is UTC+2 with no DST. */
const ZONE = "Asia/Nicosia";
/**
 * A January instant on purpose: `Asia/Nicosia` is UTC+2 year-round in winter, so
 * 10:00Z is exactly 12:00 wall-clock. A summer date would be UTC+3 (13:00) and
 * would silently tie the expectation to the DST rules of whatever tzdata the
 * runner ships. The UTC fallback renders the same instant as 10:00 — the 2h gap
 * is what makes case 10b able to fail.
 */
const START_UTC = "2099-01-01T10:00:00Z";
const WALL_CLOCK_IN_ZONE = "12:00";

/** A draft as the detail read view returns it (shape copied from mentions-picker.test.tsx). */
function draft(): MaintenanceDetail {
  return {
    id: "m-1",
    title: "DB index migration",
    description: "Rebuild the index",
    status: "draft",
    impact: "none",
    scope: "global",
    planned_period: { start: START_UTC, end: "2099-01-01T11:00:00Z" },
    resources: [],
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
    mentions: [],
  };
}

/**
 * The form under the REAL provider. `serverZone` is the only knob: it is what
 * the root layout passes from the `mm.tz` cookie, and `null` is the legitimate
 * "server had no cookie" state, not an error path.
 */
function Subject({ serverZone }: { serverZone: string | null }) {
  return (
    <TimezoneProvider serverZone={serverZone}>
      <MaintenanceEditMode detail={draft()} onClose={() => undefined} />
    </TimezoneProvider>
  );
}

/**
 * The time the "Planned start" trigger shows.
 *
 * Only the time is asserted, never the whole label: `formatTrigger`
 * (`shared/ui/domain/date-time-picker.tsx:49-54`) builds the date half through
 * `toLocaleDateString` on a `Date` constructed in the RUNNER's zone
 * (`TZ=Asia/Nicosia`, pinned in `vitest.config.ts:15`), while the time half is
 * the raw `HH:MM` substring of the wall-clock the form seeded. The time is the
 * zone-conversion signal; the date would just re-assert the runner's TZ pin.
 */
function triggerTime(): string {
  const label = screen.getByRole("button", { name: "Planned start" }).textContent ?? "";
  return timeIn(label);
}

/**
 * Same extraction against a markup string, for the pre-mount (SSR) frame.
 * Reduced to just the time on purpose: a raw `toContain` on the whole form's
 * HTML prints ~40 KB of markup on failure, which buries the one value that
 * matters. `"—"` stands for "no time shown at all" (the unseeded `""` start,
 * which renders the picker's "Pick a date & time" placeholder).
 */
function timeIn(text: string): string {
  return text.match(/(\d{2}:\d{2})/)?.[1] ?? "—";
}

/** Pre-mount frame: the whole form's first render, before any effect runs. */
function ssrStartTime(serverZone: string | null): string {
  // The end date is rendered too and also carries an HH:MM, so scope the match
  // to the start trigger's own markup — keyed off the aria-label the test reads
  // in the DOM, so both paths depend on the same one attribute.
  const html = renderToString(<Subject serverZone={serverZone} />);
  const trigger = html.split('aria-label="Planned start"')[1] ?? "";
  return timeIn(trigger.split("</button>")[0] ?? "");
}

describe("maintenance edit-mode start seed across zone resolution (RUK-233 AC-10)", () => {
  it("shows the draft start in the viewer's zone when the cookie already agrees with me.timezone (AC-10a)", async () => {
    // The letter of AC-10: the server rendered with `mm.tz=Asia/Nicosia` and
    // `me.timezone` says the same, so `zone` is Nicosia on the first frame and
    // never changes. Correct before AND after mount — no 10:00 flash.
    meData.mockReturnValue({ timezone: ZONE });

    render(<Subject serverZone={ZONE} />);

    expect(triggerTime()).toBe(WALL_CLOCK_IN_ZONE);
    // Hold past the provider's post-mount adoption: `ready` flips false → true
    // and re-renders the form, and the value must survive that too.
    await waitFor(() => expect(triggerTime()).toBe(WALL_CLOCK_IN_ZONE));
  });

  it("corrects the seeded start once the zone resolves post-mount (AC-10b)", async () => {
    // No cookie (first visit / JS-disabled path), so the provider's first frame
    // is the UTC fallback and `me.timezone` only lands after mount. THIS is the
    // case that fails if the seed stops re-running on a `zone` change — the
    // field would stay on the UTC wall-clock and the operator would edit a
    // draft two hours off, with nothing on screen saying so.
    meData.mockReturnValue({ timezone: ZONE });

    render(<Subject serverZone={null} />);

    // The load-bearing assertion: post-mount the authoritative zone has landed
    // and the seed must have (re-)run with it — 12:00, never the 10:00 the UTC
    // fallback produced. Move the seed out of its effect and this reads 10:00.
    await waitFor(() => expect(triggerTime()).toBe(WALL_CLOCK_IN_ZONE));

    // Backstop, on the pre-mount frame: prove 12:00 was not simply there from
    // the start, i.e. that the assertion above is a real correction and not a
    // value no implementation could get wrong. `renderToString` and not RTL, for
    // the reason `use-timezone.test.tsx:36-39` spells out — `render` wraps in
    // `act`, so both mount effects (the provider adopting the zone AND the
    // form's re-seed) have already run before the DOM is observable.
    //
    // With the seed in an effect, `start` is still `""` here, so no time shows
    // at all. A time on this frame means the seed moved into render, where the
    // only zone available is the pre-mount one — UTC under `serverZone={null}`.
    expect(ssrStartTime(null)).toBe("—");
  });
});
