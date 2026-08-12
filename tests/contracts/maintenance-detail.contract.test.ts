import { describe, expect, it, vi } from "vitest";

import { createBackendMock, readWireFixture } from "./_harness";
import { expectWireFields, type FieldSpec } from "./_wire-assertions";

import type { MaintenanceViewResponseDto } from "@/server/backend/contracts/maintmode-dto";

/**
 * Contract test — `GET /api/maintenance/{id}`. RUK-254, SPEC-RUK-254.md §4.1/§4.5.
 *
 * This is the RUK-156 endpoint: the detail screen was assembled against an
 * invented `{maintenance, actions, conflicts}` envelope before anyone had
 * looked at the response. The envelope turned out to be right; that was luck,
 * and luck is not a mechanism. The recorded capture makes it checkable.
 *
 * This endpoint is also the CONTROL for the calendar's biggest gap. Detail
 * events carry a populated `resources` array — the calendar's do not, which is
 * why `mapCalendarResponse` hardcodes `resources: []` (maintenance-mapper.ts
 * :229) and why the calendar's resource filter cannot work (RUK-256). The two
 * fixtures side by side are the evidence that this is a backend contract
 * difference and not a frontend bug, so the assertions below pin the presence
 * of `resources` HERE just as calendar.contract.test.ts pins its absence there.
 */

const wire = readWireFixture<MaintenanceViewResponseDto>("maintenance-detail.json");

const backendRequest = createBackendMock(wire);
vi.mock("@/server/backend/client/authenticated-backend-request", () => ({
  authenticatedBackendRequest: (opts: { path: string }) => backendRequest(opts),
}));

const { GET } = await import("@/app/api/maintenance/[id]/route");

function call(id: string) {
  return GET(new Request(`http://localhost/api/maintenance/${id}`), {
    params: Promise.resolve({ id }),
  });
}

describe("GET /api/maintenance/{id} — request forwarding", () => {
  it("forwards the id into the backend path", async () => {
    await call("m-42");

    expect(backendRequest.mock.calls[0]?.[0].path).toBe("/ui/v1/maintenances/m-42");
  });

  it("encodes an id containing path characters rather than splicing the URL", async () => {
    // An unencoded id is a path-traversal seam: `../` in the segment would
    // repoint the request at a different backend resource entirely.
    await call("a/../b");

    const path = backendRequest.mock.calls[0]?.[0].path ?? "";
    expect(path).toBe("/ui/v1/maintenances/a%2F..%2Fb");
    expect(path).not.toContain("/../");
  });
});

/**
 * The wire contract, as INDEPENDENT literals — not read back out of `wire`.
 */
const REQUIRED_MAINTENANCE_FIELDS: readonly FieldSpec[] = [
  ["id", "string"],
  ["title", "string"],
  ["status", "string"],
  ["impact", "string"],
  ["scope", "string"],
  ["planned_time_start", "string"],
  ["planned_time_end", "string"],
  ["resources", "array"],
  ["steps", "array"],
];

const REQUIRED_ACTION_FLAGS = ["can_edit", "can_approve", "can_start", "can_cancel", "can_complete"] as const;

/**
 * Assert every action flag is a real boolean on the given `actions` object.
 *
 * Asserted twice — once on the recorded wire, once on what the route hands the
 * client — because they are different claims: the backend can stop sending a
 * flag, and the route can stop forwarding one. `label` says which end failed.
 *
 * Not `expectWireFields`: that walks ROWS of a collection, this walks the keys
 * of one object, and a `typeof` on a missing key reads `undefined` — which is
 * the falsy-button defect being pinned.
 */
function expectActionFlags(actions: Record<string, unknown> | undefined, label: string): void {
  for (const flag of REQUIRED_ACTION_FLAGS) {
    expect(`${label}.${flag}: ${typeof actions?.[flag]}`).toBe(`${label}.${flag}: boolean`);
  }
}

describe("GET /api/maintenance/{id} — the recorded response still matches the contract", () => {
  it("answers the three-part envelope the detail screen was built against", () => {
    // RUK-156's invented shape, now verified against the wire instead of
    // assumed. `conflicts` may legitimately be empty; the KEY must be there,
    // since its absence is what would make the conflict banner silently vanish.
    for (const key of ["maintenance", "actions", "conflicts"] as const) {
      expect(`${key}: ${key in wire ? "present" : "MISSING"}`).toBe(`${key}: present`);
    }
  });

  it("carries every maintenance field the detail screen renders, with the right type", () => {
    // Type included: `resources` or `steps` arriving as an object rather than an
    // array would make every `.map()` on the detail screen throw at render, and
    // presence alone could not tell the difference.
    expectWireFields(
      [(wire.maintenance ?? {}) as unknown as Record<string, unknown>],
      REQUIRED_MAINTENANCE_FIELDS,
      "maintenance",
    );
  });

  it("carries every action flag the button row gates on", () => {
    // A missing flag reads as `undefined` → falsy → button hidden. An operator
    // who cannot see "Approve" concludes they lack permission, and the real
    // cause (a renamed field) leaves no trace anywhere.
    expectActionFlags(wire.actions as Record<string, unknown> | undefined, "wire actions");
  });

  it("carries POPULATED `resources` here, unlike calendar events (the RUK-256 control)", () => {
    // The counterpart to calendar.contract.test.ts's "records events that carry
    // NO `resources` field". Detail has them; calendar does not. That asymmetry
    // is the whole of the RUK-256 gap, and holding both ends of it in tests is
    // what stops it being rediscovered from scratch a third time.
    const resources = (wire.maintenance as { resources?: unknown[] })?.resources;

    expect(Array.isArray(resources)).toBe(true);
    expect(resources?.length).toBeGreaterThan(0);
    for (const resource of resources ?? []) {
      expect(Object.keys(resource as object)).toEqual(expect.arrayContaining(["id", "name"]));
    }
  });

  it("records `notify_targets` as a key the backend really sends", () => {
    // Empty in this capture (a draft notifies nobody yet), but PRESENT — which
    // is the difference between "no targets set" and "the field does not
    // exist". Calendar events have no such key at all; see the registry.
    const maintenance = (wire.maintenance ?? {}) as unknown as Record<string, unknown>;

    expect("notify_targets" in maintenance).toBe(true);
    expect(Array.isArray(maintenance.notify_targets)).toBe(true);
  });
});

describe("GET /api/maintenance/{id} — response pass-through", () => {
  it("projects the recorded response into the domain shape the screen renders", async () => {
    const body = await (await call("m-1")).json();

    // Domain-side names are independent literals: the mapper dropping `title`
    // or renaming `planned_period` fails here whatever the fixture holds.
    expect(Object.keys(body)).toEqual(
      expect.arrayContaining(["id", "title", "status", "impact", "scope", "planned_period", "steps"]),
    );
    expect(body.planned_period).toEqual({
      start: expect.stringMatching(/^\S+$/),
      end: expect.stringMatching(/^\S+$/),
    });
    // Must survive as real text, not be defaulted away by `?? ""`.
    expect(body.title.length).toBeGreaterThan(0);
  });

  it("carries the resources through to the client rather than emptying them", async () => {
    // The mapper's calendar path hardcodes `resources: []`. If that stub ever
    // spread to the detail path, the detail screen would show a maintenance
    // affecting nothing — and nothing else would fail.
    const body = await (await call("m-1")).json();
    const recorded = (wire.maintenance as { resources?: unknown[] })?.resources ?? [];

    expect(body.resources).toHaveLength(recorded.length);
    expect(body.resources.length).toBeGreaterThan(0);
  });

  it("passes the action flags through so the button row is not silently disabled", async () => {
    const body = await (await call("m-1")).json();

    expectActionFlags(body.actions, "response actions");
  });
});

describe("GET /api/maintenance/{id} — errors must not degrade into an empty maintenance", () => {
  it("answers with an error status when the backend fails", async () => {
    // A blank detail screen reads as "this maintenance has no steps, no
    // resources, nobody notified" — a maintenance that looks harmless. Same
    // degradation shape as the approver-picker P0, on a screen an operator uses
    // to decide whether to approve.
    backendRequest.mockRejectedValue(new Error("backend exploded"));

    const response = await call("m-1");

    expect(response.status).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body.id).toBeUndefined();
    expect(body.steps).toBeUndefined();
  });
});
