import { describe, expect, it, vi } from "vitest";

import { createBackendMock, readWireFixture } from "./_harness";

import type { CalendarEventDto, CalendarViewResponseDto } from "@/server/backend/contracts/maintmode-dto";

/**
 * Wave 2 / W1: `GET /api/calendar` forwards the backend's `meta`
 * (`uimodels.CalendarViewMeta` — `{ count, truncated }`) alongside `items`.
 *
 * The backend caps the calendar at 1000 events and reports the cap through
 * `meta.truncated`. The route used to return `{ items }` only, so the UI could
 * not distinguish a truncated window from a complete one and silently hid work
 * past the cap (RUK-252). These pin the pass-through in both directions:
 * present `meta` reaches the client, absent `meta` leaves `items` intact rather
 * than breaking the envelope.
 *
 * `meta` keeps both fields rather than being reduced to a boolean — `count` is
 * rendered in the truncation notice — but it is PROJECTED, not spread verbatim.
 * The DTO describes the contract, not what actually arrived, and `count` now
 * reaches the DOM: `truncated` narrows to a real boolean and `count` is dropped
 * unless it is a finite number, so a backend drifting off-contract cannot put
 * an arbitrary value in front of the operator.
 *
 * RUK-254: the events fed in are RECORDED ones
 * (`tests/fixtures/wire/calendar.json`), not the hand-typed `{id: "m-1", title:
 * "Core switch upgrade", …}` literal this file used to carry. That literal was
 * an author's belief about the endpoint, and a belief agrees with the code even
 * when both are wrong about the wire (SPEC §4.1, point 4). The `meta` cases
 * below still construct their meta values by hand on purpose: they exercise
 * OFF-CONTRACT input (`truncated: "yes"`, `count: null`), which by definition
 * cannot be captured from a backend behaving correctly.
 */

const wire = readWireFixture<CalendarViewResponseDto>("calendar.json");
const recordedEvents = wire.events ?? [];

// No default response: every case here supplies its own body, because the point
// of the suite is how the route treats OFF-CONTRACT `meta` values.
const backendRequest = createBackendMock<CalendarViewResponseDto>();
vi.mock("@/server/backend/client/authenticated-backend-request", () => ({
  authenticatedBackendRequest: (opts: { path: string }) => backendRequest(opts),
}));

const { GET } = await import("@/app/api/calendar/route");

/**
 * One RECORDED calendar event, optionally varied.
 *
 * The base is the first event the backend actually returned, so every field
 * this test relies on exists because the wire carries it — not because someone
 * typed it here.
 */
function event(overrides: Partial<CalendarEventDto> = {}): CalendarEventDto {
  const [first] = recordedEvents;
  if (!first) throw new Error("calendar.json recorded no events — refresh the fixture");
  return { ...first, ...overrides };
}

function call(query = "from=2026-06-01&to=2026-06-30") {
  return GET(new Request(`http://localhost/api/calendar?${query}`));
}

describe("GET /api/calendar meta pass-through (wave 2 W1)", () => {
  it("forwards `meta` when the backend reports a truncated window", async () => {
    backendRequest.mockResolvedValue({
      events: [event()],
      meta: { count: 1000, truncated: true },
    });

    const body = await (await call()).json();

    expect(body.meta).toEqual({ count: 1000, truncated: true });
    expect(body.items).toHaveLength(1);
  });

  it("forwards `meta` for a complete window too, so the UI reads a real signal", async () => {
    backendRequest.mockResolvedValue({
      events: [event()],
      meta: { count: 510, truncated: false },
    });

    const body = await (await call()).json();

    // `truncated: false` must survive as false — not be dropped as falsy, which
    // would leave the client unable to tell "complete" from "unknown".
    expect(body.meta).toEqual({ count: 510, truncated: false });
  });

  it("still answers with intact `items` when the backend omits `meta`", async () => {
    backendRequest.mockResolvedValue({ events: [event(), event({ id: "second-event" })] });

    const response = await call();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(2);
    // Identity must survive the projection, and in wire order: a route that
    // reordered or re-keyed events would put the operator on the wrong record.
    expect(body.items.map((item: { id: string }) => item.id)).toEqual([event().id, "second-event"]);
    expect(body.meta).toBeUndefined();
  });

  it("narrows an off-contract `truncated` to a real boolean", async () => {
    // The DTO says boolean; the wire says whatever the backend sent. A truthy
    // non-boolean must not survive into the client's `=== true` check.
    backendRequest.mockResolvedValue({
      events: [],
      meta: { truncated: "yes" as unknown as boolean, count: 12 },
    });

    const body = await (await call()).json();

    expect(body.meta).toEqual({ truncated: false, count: 12 });
  });

  it("drops a `count` that is not a finite number, keeping the truncation signal", async () => {
    // `count` is rendered into the notice's copy, so a non-number would print
    // "первые null работ". Truncation is still reported — only the quantity goes.
    backendRequest.mockResolvedValue({
      events: [],
      meta: { truncated: true, count: null as unknown as number },
    });

    const body = await (await call()).json();

    expect(body.meta).toEqual({ truncated: true });
    expect(body.meta.count).toBeUndefined();
  });

  it("keeps the events projection unchanged by the meta addition", async () => {
    backendRequest.mockResolvedValue({
      events: [event()],
      meta: { count: 1, truncated: false },
    });

    const body = await (await call()).json();

    // Domain-side field NAMES are independent literals — the mapper dropping
    // `title` or renaming `status` fails here whatever the fixture holds.
    expect(Object.keys(body.items[0])).toEqual(
      expect.arrayContaining(["id", "title", "status", "scope", "planned_period"]),
    );
    // …and the recorded values must survive the projection rather than being
    // defaulted away by a `?? ""`.
    expect(body.items[0].id).toBe(event().id);
    expect(body.items[0].title).toBe(event().title);
    expect(body.items[0].title.length).toBeGreaterThan(0);
  });

  it("surfaces a backend failure instead of an empty-but-successful calendar", async () => {
    backendRequest.mockRejectedValue(new Error("backend exploded"));

    const response = await call();

    expect(response.status).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body.items).toBeUndefined();
  });
});
