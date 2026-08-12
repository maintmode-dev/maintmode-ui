import { describe, expect, it, vi } from "vitest";

import { createBackendMock, readWireFixture, backendQuery } from "./_harness";
import { expectWireFields, type FieldSpec } from "./_wire-assertions";

import type { CalendarViewResponseDto } from "@/server/backend/contracts/maintmode-dto";

/**
 * Contract test — `GET /api/calendar`. RUK-254, SPEC-RUK-254.md §4.1.
 *
 * The response here is the RECORDED backend answer
 * (`tests/fixtures/wire/calendar.json`, captured by `npm run fixtures:refresh`),
 * not a literal typed by hand. That distinction is the whole point: a
 * hand-written fixture encodes what its author BELIEVES the backend sends, so
 * it agrees with the code even when both are wrong about the wire. RUK-256 is
 * the standing proof — `calendar-filters.test.ts` exercises `resourceOptions`
 * against events carrying non-empty `resources`, a shape this endpoint has
 * never returned, so the suite is green while the resource filter is dead in
 * production.
 *
 * Four questions, per SPEC §4.1: does the request reach the backend intact,
 * does the answer reach the client intact, does an error stay an error, and is
 * the whole thing anchored to the wire rather than to our beliefs about it.
 */

const wire = readWireFixture<CalendarViewResponseDto>("calendar.json");

const backendRequest = createBackendMock(wire);
vi.mock("@/server/backend/client/authenticated-backend-request", () => ({
  authenticatedBackendRequest: (opts: { path: string }) => backendRequest(opts),
}));

const { GET } = await import("@/app/api/calendar/route");

async function callRoute(query = "from=2026-08-10&to=2026-08-12") {
  const response = await GET(new Request(`http://localhost/api/calendar?${query}`));
  return { response, body: await response.json() };
}

describe("GET /api/calendar — request forwarding", () => {
  it("forwards the `from`/`to` window to the backend", async () => {
    await callRoute("from=2026-08-10&to=2026-08-12");
    const query = backendQuery(backendRequest);

    expect(query.get("from")).toBe("2026-08-10");
    expect(query.get("to")).toBe("2026-08-12");
  });

  it("forwards every repeated `resource_ids` and `statuses` filter", async () => {
    // Repeated params are where a forwarding bug hides: dropping the loop leaves
    // a single value (or none) reaching the backend, which then answers a WIDER
    // set than asked for. The UI narrows it client-side and looks correct — the
    // exact shape of the approver-picker P0, one endpoint over.
    await callRoute(
      "from=2026-08-10&to=2026-08-12&statuses=draft&statuses=approved&resource_ids=r-1&resource_ids=r-2",
    );
    const query = backendQuery(backendRequest);

    expect(query.getAll("statuses")).toEqual(["draft", "approved"]);
    expect(query.getAll("resource_ids")).toEqual(["r-1", "r-2"]);
  });
});

/**
 * The wire contract, written as INDEPENDENT literals.
 *
 * These are deliberately not derived from `wire`. An expectation read back out
 * of the fixture under test is a tautology: it holds under every mutation of
 * that fixture, so the test stays green while the contract moves. Proven —
 * renaming `status` → `state` across all 12 recorded events left an earlier
 * version of this file 8/8 green, which is the very drift RUK-254 exists to
 * catch. The literals below are what a human asserts the backend sends; the
 * fixture is what it actually sent. A test is only meaningful where the two are
 * independent and can disagree.
 */
const REQUIRED_EVENT_FIELDS: readonly FieldSpec[] = [
  ["id", "string"],
  ["title", "string"],
  ["start", "string"],
  ["end", "string"],
  ["status", "string"],
  ["scope", "string"],
  ["impact", "string"],
];

describe("GET /api/calendar — the recorded response still matches the contract", () => {
  it("carries every field the calendar grid depends on, with the right type", () => {
    // Catches the rename/removal class directly — drop or rename any of these on
    // the wire and this fails, naming the field — and now the type class too:
    // `start`/`end` arriving as epoch numbers instead of ISO strings would place
    // every event at the epoch rather than erroring.
    expectWireFields(
      (wire.events ?? []) as unknown as Record<string, unknown>[],
      REQUIRED_EVENT_FIELDS,
      "calendar events",
    );
  });

  it("reports `meta.truncated` as a boolean and `meta.count` as a number", () => {
    // RUK-252: the backend caps the calendar at 1000 events and reports the cap
    // ONLY here. Types are asserted, not copied, so a backend switching
    // `truncated` to a string or `count` to a string fails here.
    expect(typeof wire.meta?.truncated).toBe("boolean");
    expect(typeof wire.meta?.count).toBe("number");
  });
});

describe("GET /api/calendar — response pass-through", () => {
  it("maps every recorded event into `items`", async () => {
    const { body } = await callRoute();

    expect(body.items).toHaveLength((wire.events ?? []).length);
  });

  it("surfaces `meta` to the client so a capped window is visible", async () => {
    const { body } = await callRoute();

    // Shape asserted independently; only `count` is read from the fixture, since
    // its VALUE is bucketed at capture time and is not a contract claim.
    expect(body.meta).toBeDefined();
    expect(typeof body.meta.truncated).toBe("boolean");
    expect(body.meta.count).toBe(wire.meta?.count);
  });

  it("projects a recorded event into the domain shape the grid renders", async () => {
    const { body } = await callRoute();
    const [first] = body.items;

    // Domain-side field names are literals: the mapper renaming
    // `planned_period` or dropping `title` fails here regardless of the fixture.
    expect(Object.keys(first)).toEqual(
      expect.arrayContaining(["id", "title", "planned_period", "status", "scope"]),
    );
    expect(first.planned_period).toEqual({
      start: expect.stringMatching(/^\S+$/),
      end: expect.stringMatching(/^\S+$/),
    });
    // `title` must survive as real text, not be defaulted away by `?? ""`.
    expect(first.title.length).toBeGreaterThan(0);
  });
});

describe("GET /api/calendar — errors must not degrade into an empty calendar", () => {
  it("answers with an error status when the backend fails", async () => {
    // An empty calendar and a failed calendar look identical to an operator:
    // both render "no maintenance". The approver-picker P0 was exactly this —
    // a 403 becoming `{users: []}`, read as "no people found".
    backendRequest.mockRejectedValue(new Error("backend exploded"));

    const response = await GET(new Request("http://localhost/api/calendar?from=2026-08-10&to=2026-08-12"));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await response.json()).items).toBeUndefined();
  });
});

describe("the wire fixture itself (SPEC §4.2 — the recorded contract)", () => {
  it("records events that carry NO `resources` field", () => {
    // Not a wish — a record of what the backend actually sends, and the reason
    // the calendar's resource filter cannot work (RUK-256). This assertion is
    // deliberately inverted: it FAILS when the backend starts sending
    // `resources`, which is the moment the filter becomes implementable and the
    // gap row in docs/contract-gaps.md becomes stale.
    const events = wire.events ?? [];

    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => !("resources" in event))).toBe(true);
  });

  it("records `meta`, so the truncation signal exists on the wire", () => {
    expect(wire.meta).toBeDefined();
    expect(typeof wire.meta?.count).toBe("number");
  });
});
