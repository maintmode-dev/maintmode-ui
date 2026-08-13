import { describe, expect, it } from "vitest";

import { readWireFixture } from "./_harness";

import { mapCalendarResponse } from "@/server/backend/contracts/maintenance-mapper";
import type { CalendarViewResponseDto } from "@/server/backend/contracts/maintmode-dto";
import { MOCK_CALENDAR_EVENTS, MOCK_MAINTENANCES } from "@/shared/mock/maintenances";

/**
 * The calendar payload contract — RUK-258.
 *
 * `mapCalendarResponse` used to project the wire onto `Maintenance`, the detail
 * page's shape, which has fields the calendar endpoint never sends. The mapper
 * invented them: `notify_targets: []`, `steps: []`, `created_at: start`,
 * `updated_at: start`. Nothing read them and they rode along in every event of
 * every response.
 *
 * Nothing prevented that, and nothing would prevent it coming back — a future
 * author needs one screen that wants `steps` on the grid to add the field "for
 * now" and stub it again. So the shape is pinned here rather than left to
 * review.
 *
 * Both assertions are written as INDEPENDENT literals. Deriving them from the
 * mapper (or from the fixture) would make them tautologies that survive every
 * mutation of the thing they check — the defect class behind RUK-254.
 */

const wire = readWireFixture<CalendarViewResponseDto>("calendar.json");

/**
 * Every key a calendar event may carry, asserted as a literal.
 *
 * `created_by` is optional on the type and present only when the wire names an
 * author, so it is excluded from the required set and checked separately.
 */
const EXPECTED_KEYS = ["id", "title", "status", "impact", "scope", "planned_period", "resources"].sort();

/** Fields removed in RUK-258. Each name is spelled out so a revert fails loudly. */
const REMOVED_KEYS = ["notify_targets", "steps", "created_at", "updated_at"];

/**
 * `created_by` rides on the presence of an author, so it is compared out of
 * band; everything else must match EXACTLY — not `arrayContaining`, which would
 * let a reintroduced field slip through silently.
 *
 * Shared by the mapper's projection and the mock feed's, which is the point:
 * the two are asserted against one literal, so they cannot be brought back into
 * agreement by editing only one of them.
 */
function assertEventKeys(events: readonly object[]) {
  for (const event of events) {
    const keys = Object.keys(event)
      .filter((key) => key !== "created_by")
      .sort();

    expect(keys).toEqual(EXPECTED_KEYS);
  }
}

describe("mapCalendarResponse — the projected event shape is pinned", () => {
  it("carries exactly the calendar's own fields, and none of the detail page's", () => {
    const events = mapCalendarResponse(wire);
    expect(events.length).toBeGreaterThan(0);

    assertEventKeys(events);
  });

  it("names each removed field, so bringing one back fails here", () => {
    // The assertion above already covers this by exact comparison. This one
    // exists for its failure message: it says WHICH field returned and that
    // RUK-258 removed it deliberately, which an "arrays differ" diff does not.
    const events = mapCalendarResponse(wire);

    for (const field of REMOVED_KEYS) {
      const carrying = events.filter((event) => field in event).length;

      expect(
        carrying === 0
          ? `${field}: absent`
          : `${field}: BACK ON ${carrying} event(s). RUK-258 removed it because the calendar ` +
              `wire never carried it and nothing reads it. If a screen now needs it, the backend ` +
              `must send it first — see docs/contract-gaps.md, Класс C.`,
      ).toBe(`${field}: absent`);
    }
  });

  it("carries each wire value into the field it belongs in", () => {
    // The key-set assertions above pin the SHAPE. They say nothing about where
    // the values come from, and that gap is wide: swapping `start` and `end`,
    // or hardcoding `status`/`impact`/`scope` to a constant, passed all 150
    // contract tests — verified by mutation. The grid would render every event
    // backwards, or paint the whole month one colour, with contracts green.
    //
    // So the mapping is exercised on a SYNTHETIC event whose every value is
    // distinct. This is deliberately not the recorded fixture: the fixture is
    // anonymized (`<ts-1>`, `"Unknown user"` on all 12 events), so a mapper
    // returning constants is indistinguishable from one reading fields. What
    // the wire actually sends stays pinned by `calendar.contract.test.ts`;
    // this pins where each of those values ends up.
    const [event] = mapCalendarResponse({
      events: [
        {
          id: "probe-1",
          title: "Probe title",
          start: "2026-06-05T14:00:00Z",
          end: "2026-06-05T16:00:00Z",
          status: "in_progress",
          impact: "partial_outage",
          scope: "resource",
          created_by: { id: "u-1", display_name: "Distinctive Name", email: "u@example.test" },
        },
      ],
    });

    expect(event).toEqual({
      id: "probe-1",
      title: "Probe title",
      status: "in_progress",
      impact: "partial_outage",
      scope: "resource",
      // Order matters and was not previously asserted anywhere: `start` must be
      // the wire's `start`.
      planned_period: { start: "2026-06-05T14:00:00Z", end: "2026-06-05T16:00:00Z" },
      resources: [],
      // `display_name`, not `email` and not a constant.
      created_by: "Distinctive Name",
    });
  });

  it("carries the author through, rather than stubbing it to undefined", () => {
    // `created_by` is the only field of the projection with a non-trivial
    // translation (`UserSummaryDto` → display name via `mapUserSummary`), which
    // makes it the one most easily "simplified" into a stub. Replacing the whole
    // expression with `created_by: undefined` passed every other assertion in
    // this suite — it is optional on the type, so the key-set check skips it —
    // and would have turned a live projection into exactly the kind of invented
    // field RUK-258 removed.
    //
    // The registry's stub grep does not cover it either: it matches
    // `created_by: undefined` but then only checks that the name appears
    // somewhere in docs/contract-gaps.md, and it does — in an unrelated RUK-192
    // row. So the check passes vacuously. That machinery is not this ticket's to
    // repair (AGENTS.md), and this assertion is the local guard instead.
    const authored = (wire.events ?? []).filter((event) => event.created_by);
    expect(authored.length).toBeGreaterThan(0);

    const events = mapCalendarResponse(wire);
    const withAuthor = events.filter((event) => typeof event.created_by === "string");

    expect(`events carrying an author: ${withAuthor.length}`).toBe(
      `events carrying an author: ${authored.length}`,
    );
  });

  it("keeps `resources`, the one deliberate stub, so the sidebar filter survives", () => {
    // Not waste, unlike the four above: `matchesFilters` and `resourceOptions`
    // read it. Empty only because the backend omits the field (RUK-256).
    // Deleting it would delete the resource filter, not clean up after it.
    const events = mapCalendarResponse(wire);

    expect(events.every((event) => Array.isArray(event.resources))).toBe(true);
  });
});

/**
 * The size claim, measured rather than asserted from memory.
 *
 * The pre-change projection is declared here explicitly — the four removed
 * fields exactly as the old mapper wrote them — rather than kept as a magic
 * baseline number that would silently rot when the fixture is recaptured.
 */
function preChangeProjection(): unknown[] {
  return mapCalendarResponse(wire).map((event) => ({
    ...event,
    resources: [],
    notify_targets: [],
    steps: [],
    created_at: event.planned_period.start,
    updated_at: event.planned_period.start,
  }));
}

describe("the payload is measurably smaller (RUK-258's whole point)", () => {
  it("drops at least 25% of the serialized bytes", () => {
    const before = Buffer.byteLength(JSON.stringify(preChangeProjection()), "utf8");
    const after = Buffer.byteLength(JSON.stringify(mapCalendarResponse(wire)), "utf8");
    const saved = (1 - after / before) * 100;

    // Measured at 27.4% on the recorded fixture. The threshold sits below that
    // with room to spare, because the exact figure moves with the fixture's
    // (anonymized) id and timestamp lengths — the RATIO is what the ticket
    // claims, and it survives that anonymization since placeholders shorten
    // numerator and denominator alike.
    //
    // The ticket asked for "roughly half". It is not achievable: that number
    // counted `impact` and `created_by` as waste, and both are backed by data
    // the wire actually carries. See SPEC.md §1.1 CORR-1.
    //
    // This measures RAW bytes, which is the right metric for what the test
    // guards — the shape of the projection. Over the wire the figure is smaller:
    // ~18.6% gzipped on this fixture, because repeated empty arrays compress
    // well. Quote 27.4% for "fields removed", not for "traffic saved"; whether
    // /api/calendar is compressed at all is RUK-261 and is not answerable from
    // this repository.
    expect(`${saved >= 25 ? "ok" : "TOO SMALL"} (${saved.toFixed(1)}%)`).toBe(`ok (${saved.toFixed(1)}%)`);
    expect(after).toBeLessThan(before);
  });
});

describe("the mock feed matches the real projection", () => {
  it("carries the same keys, so mock mode cannot drift from the wire", () => {
    // The compiler does NOT catch this: `Maintenance` is structurally
    // assignable to `CalendarEvent` (it has every required key and more), so
    // handing `MOCK_MAINTENANCES` over unchanged compiles clean while quietly
    // keeping all four removed fields — plus `reference` — in mock mode.
    // Excess-property checking only fires on fresh object literals, and the
    // mock is a variable. Hence a real assertion.
    expect(MOCK_CALENDAR_EVENTS.length).toBeGreaterThan(0);

    assertEventKeys(MOCK_CALENDAR_EVENTS);
  });

  it("copies the values across, not just the key names", () => {
    // Key names alone are too weak here, and measurably so: emptying
    // `planned_period` to `{ start: "", end: "" }` in the projection passed all
    // 150 contract and 1044 unit tests — mock mode would render every event with
    // no window and look like a calendar bug. Dropping the `created_by` spread
    // was equally invisible, because the key-set check filters that field out by
    // design.
    //
    // Compared against `MOCK_MAINTENANCES` rather than a literal: the projection
    // is a copy, so "same values as the source" IS the contract. Nothing here is
    // read back out of the projection under test.
    for (const [i, event] of MOCK_CALENDAR_EVENTS.entries()) {
      const source = MOCK_MAINTENANCES[i];

      expect(event.id).toBe(source.id);
      expect(event.planned_period).toEqual(source.planned_period);
      expect(event.status).toBe(source.status);
      expect(event.resources).toEqual(source.resources);
      expect(event.created_by).toBe(source.created_by);
    }
  });
});
