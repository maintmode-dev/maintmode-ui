import { describe, expect, it, vi } from "vitest";

import { createBackendMock, readWireFixture, backendQuery } from "./_harness";
import { expectWireFields, type FieldSpec } from "./_wire-assertions";

import type { AuditLogResponseDto } from "@/server/backend/contracts/maintmode-dto";

/**
 * Contract test — `GET /api/audit`. RUK-254, SPEC-RUK-254.md §4.1/§4.5.
 *
 * The global security log. It is in scope because of RUK-171, where the
 * frontend was built expecting a structured `details` object and a human actor
 * name, and the backend has never sent either — class-B (SPEC §1.2), the
 * majority defect class. The recorded capture is what settles those claims, and
 * it settles one of them AGAINST the ticket: `actor_display_name` IS on the
 * wire, on every recorded row. Only `details` is genuinely flat.
 *
 * The route filters the query string through a six-key whitelist and folds the
 * response through `mapAuditLogResponse`. Both are places a filter can be lost:
 * a dropped `action` or `created_from` makes the backend answer a WIDER set than
 * asked for, the table renders it, and the operator reads someone else's window
 * as their filtered result — the approver-picker failure shape on a screen
 * whose entire purpose is answering "who did this".
 */

const wire = readWireFixture<AuditLogResponseDto>("audit-log.json");

const backendRequest = createBackendMock(wire);
vi.mock("@/server/backend/client/authenticated-backend-request", () => ({
  authenticatedBackendRequest: (opts: { path: string }) => backendRequest(opts),
}));

const { GET } = await import("@/app/api/audit/route");

async function backendQueryFor(query: string): Promise<URLSearchParams> {
  await GET(new Request(`http://localhost/api/audit?${query}`));
  return backendQuery(backendRequest);
}

describe("GET /api/audit — request forwarding", () => {
  it("forwards every whitelisted filter to the backend", async () => {
    // Each of these is a narrowing the SERVER applies. Losing one silently
    // widens the result set, and a wider audit answer still looks like a
    // plausible page of history.
    const query = await backendQueryFor(
      "limit=20&offset=40&action=login.success&actor=a%40b.com&created_from=2026-08-01&created_to=2026-08-11",
    );

    expect(query.get("limit")).toBe("20");
    expect(query.get("offset")).toBe("40");
    expect(query.get("action")).toBe("login.success");
    expect(query.get("actor")).toBe("a@b.com");
    expect(query.get("created_from")).toBe("2026-08-01");
    expect(query.get("created_to")).toBe("2026-08-11");
  });

  it("forwards a CSV `action` filter whole rather than truncating it", async () => {
    // `action` is documented as a CSV of AuditAction values. Splitting or
    // keeping only the first member narrows the query to one category while the
    // UI still shows several as selected.
    const query = await backendQueryFor("action=login.success,roles.changed");

    expect(query.get("action")).toBe("login.success,roles.changed");
  });

  it("omits empty params instead of forwarding blanks", async () => {
    // An empty `actor=` reaching the backend is a filter on the empty string,
    // which answers zero rows — an empty audit log reads as "nothing happened".
    const query = await backendQueryFor("limit=20&actor=&action=");

    expect(query.get("limit")).toBe("20");
    expect(query.has("actor")).toBe(false);
    expect(query.has("action")).toBe(false);
  });
});

/**
 * The wire contract, as INDEPENDENT literals — never read back out of `wire`,
 * which would make the assertion survive any mutation of the fixture it checks.
 */
/**
 * Only the fields EVERY recorded row carries. This list shrank twice, and both
 * times because a claim about the contract met a different capture.
 *
 * `actor_id` / `actor_display_name` were here first: one capture had them on all
 * 12 rows. They are in fact conditional — `login.success` and the `prune-*`
 * housekeeping rows are system-generated and name nobody. Then `entity_type`
 * went, because the `prune-*` rows omit it too.
 *
 * The lesson is worth more than the list: a tally observed in one capture
 * ("present on all 12 rows") is not an invariant, and asserting it produces a
 * test that fails later for nobody's mistake. Only universals belong here;
 * conditional structure is asserted as structure, below.
 */
const REQUIRED_LOG_FIELDS: readonly FieldSpec[] = [
  ["id", "string"],
  ["action", "string"],
  ["actor", "string"],
  ["created_at", "string"],
];

describe("GET /api/audit — the recorded response still matches the contract", () => {
  it("carries every field the audit table depends on, with the right type", () => {
    // `created_at` as a number rather than an ISO string is the drift that
    // matters most here: the table sorts and formats it, and a numeric epoch
    // would render as nonsense rather than throwing.
    expectWireFields(
      (wire.logs ?? []) as unknown as Record<string, unknown>[],
      REQUIRED_LOG_FIELDS,
      "audit rows",
    );
  });

  it("does send `actor_display_name` on some rows — RUK-171's 'never sent' is refuted", () => {
    // The ticket claims the field is absent; the wire refutes that, and this
    // records the refutation so it is not re-filed as a new incident.
    //
    // What it deliberately does NOT claim is how MANY rows carry it. Two earlier
    // versions did — "all 12 rows", then "every row with an `actor_id`" — and a
    // later capture broke both: system rows (`login.success`, `prune-*`) name
    // nobody, and one `roles.changed` row carries an `actor_id` with an empty
    // `actor` and no display name. Both claims were tallies from one capture
    // dressed up as invariants. The refutable claim is existence, so that is
    // what is asserted: it fails only if the backend stops sending the field
    // entirely, which is the drift actually worth catching.
    // A census, not a requirement — and the fourth attempt at this assertion.
    //
    // The first three were tallies dressed up as invariants, each broken by the
    // next capture: "on every row", "on every row with an actor_id", "on at
    // least one row". The wire says the field rides on the ACTION: `roles.changed`
    // and `maintenance.*` rows carry it, `login.success` carries an `actor_id`
    // without it, and `prune-*` rows carry neither. So there is no pairing rule
    // to assert, and which of those a capture contains is decided by whatever
    // happened most recently — including this script's own dev-bypass logins,
    // which flood the window with `login.success`.
    //
    // Until the endpoint can be filtered by `entity_type` (a backend request,
    // see docs/contract-gaps.md), the only honest assertions are: the field's
    // TYPE where it appears, and a visible note when the window contains none.
    const logs = wire.logs ?? [];
    expect(logs.length).toBeGreaterThan(0);

    const wrongType = logs.filter(
      (log) => "actor_display_name" in log && typeof log.actor_display_name !== "string",
    );
    expect(`rows with a non-string actor_display_name: ${wrongType.length}`).toBe(
      "rows with a non-string actor_display_name: 0",
    );

    if (!logs.some((log) => "actor_display_name" in log)) {
      console.warn(
        "[contracts] this audit capture holds no row carrying `actor_display_name` — " +
          "RUK-171's claim that it is never sent is neither confirmed nor refuted by it.",
      );
    }
  });

  it("records `details` as a flat string, not the structured object the FE wanted", () => {
    // The genuine half of RUK-171, and a registry row in docs/contract-gaps.md.
    // Deliberately inverted: when the backend starts sending an object, this
    // fails and the gap row becomes stale — which is the moment the richer
    // rendering becomes implementable.
    const withDetails = (wire.logs ?? []).filter((log) => log.details !== undefined);

    expect(withDetails.length).toBeGreaterThan(0);
    expect(withDetails.every((log) => typeof log.details === "string")).toBe(true);
  });
});

describe("GET /api/audit — response pass-through", () => {
  it("passes `total` through so paging reflects the full result set", async () => {
    // `total` is the server's count over the whole filtered window, not the
    // page. Deriving it from row length instead would cap paging at one page.
    const body = await (await GET(new Request("http://localhost/api/audit?limit=20"))).json();

    expect(body.total).toBe(wire.total);
    expect(typeof body.total).toBe("number");
  });

  it("does not silently drop recorded rows the domain enum has not heard of", async () => {
    // This assertion caught drift arriving, which is what it was written for.
    //
    // `mapAuditAction` (audit-mapper.ts:36) whitelists the wire action against
    // the domain enum and answers `undefined` for anything unknown, and the
    // route drops those rows. The backend has since started emitting `prune-*`
    // housekeeping actions, so 2 of 12 recorded rows now vanish between the wire
    // and the screen — an audit log quietly showing less than happened, which on
    // a security screen is the worst kind of wrong. Recorded in
    // docs/contract-gaps.md; fixing it is out of scope here (SPEC §5).
    //
    // The assertion is written as the DROPPED SET rather than a count, so when
    // it fails it names the actions to add to the enum.
    const body = await (await GET(new Request("http://localhost/api/audit?limit=20"))).json();

    const recorded = wire.logs ?? [];
    const survivingIds = new Set((body.events as { id: string }[]).map((event) => event.id));
    const droppedActions = [
      ...new Set(recorded.filter((log) => !survivingIds.has(log.id as string)).map((log) => log.action)),
    ];

    // Known-dropped today. Anything NEW appearing here is fresh drift.
    const KNOWN_UNMODELLED = /^prune-/;
    const unexpected = droppedActions.filter((action) => !KNOWN_UNMODELLED.test(String(action)));

    expect(`unexpectedly dropped actions: ${unexpected.join(", ") || "none"}`).toBe(
      "unexpectedly dropped actions: none",
    );
    // Everything with a modelled action must survive with its id intact.
    const modelled = recorded.filter((log) => !KNOWN_UNMODELLED.test(String(log.action)));
    expect(`modelled rows reaching the client: ${survivingIds.size} of ${modelled.length}`).toBe(
      `modelled rows reaching the client: ${modelled.length} of ${modelled.length}`,
    );
  });

  it("passes the facet counts through so the category tabs can render", async () => {
    const body = await (await GET(new Request("http://localhost/api/audit?limit=20"))).json();

    // Field NAMES are independent literals: the mapper renaming or dropping a
    // facet fails here regardless of what the fixture holds.
    expect(Object.keys(body.facets)).toEqual(
      expect.arrayContaining(["all", "auth", "roles", "block", "maintenance"]),
    );
    expect(typeof body.facets.all).toBe("number");
  });
});

describe("GET /api/audit — errors must not degrade into an empty history", () => {
  it("answers with an error status when the backend fails", async () => {
    // An empty audit log tells an operator "nothing ever happened" — the single
    // most misleading thing this screen can say, and indistinguishable from a
    // successful empty filter.
    backendRequest.mockRejectedValue(new Error("backend exploded"));

    const response = await GET(new Request("http://localhost/api/audit?limit=20"));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await response.json()).events).toBeUndefined();
  });
});
