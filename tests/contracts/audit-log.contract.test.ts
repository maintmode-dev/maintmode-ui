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
 * 12 rows. They are in fact conditional — `login.success` rows name nobody by
 * display name. Then `entity_type` went, because two `prune-*` rows omitted it.
 * Those rows later turned out to be residue of the BACKEND'S OWN TEST
 * (`prune_test.go` writes them into the database the capture read) and were
 * removed from the fixture (RUK-297), but `entity_type` stays out: the wire
 * model marks it `omitempty`, so it is not a universal either.
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
    // later capture broke both: system rows (`login.success`) name nobody, and
    // one `roles.changed` row carries an `actor_id` with an empty
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
    // without it (and the omitempty wire model allows neither). So there is no
    // pairing rule
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

  it("drops no recorded row", async () => {
    // This assertion caught drift arriving, which is what it was written for:
    // an allowlist in the mapper dropped every row whose action the domain enum
    // had not heard of — five real security events among them (RUK-297).
    // Unknown actions are now rendered as neutral rows, so NOTHING with an id
    // and an action may vanish between the wire and the client. No exception
    // list: the `prune-*` exception that used to live here guarded rows that
    // were never a contract (backend test residue, see docs/contract-gaps.md).
    //
    // Written as the DROPPED SET rather than a count, so a failure names what
    // went missing.
    const body = await (await GET(new Request("http://localhost/api/audit?limit=20"))).json();

    const recorded = wire.logs ?? [];
    expect(recorded.length).toBeGreaterThan(0);
    const survivingIds = new Set((body.events as { id: string }[]).map((event) => event.id));
    const droppedActions = [
      ...new Set(recorded.filter((log) => !survivingIds.has(log.id as string)).map((log) => log.action)),
    ];

    expect(`dropped actions: ${droppedActions.join(", ") || "none"}`).toBe("dropped actions: none");
  });

  it("keeps a row whose action this build has never heard of", async () => {
    // The class fix, not the five-action fix: the next action the backend adds
    // reaches the screen as a neutral row before anyone models it. The row is a
    // recorded one with only its action swapped for a literal no enum contains.
    const [row] = (wire.logs ?? []).filter((log) => log.action === "login.success");
    expect(row).toBeDefined();
    backendRequest.mockResolvedValueOnce({ ...wire, logs: [{ ...row, action: "brand.new_action" }] });

    const body = await (await GET(new Request("http://localhost/api/audit?limit=20"))).json();

    expect(body.events.map((e: { action: string }) => e.action)).toEqual(["brand.new_action"]);
    expect(body.events[0].id).toBe(row.id);
  });

  it("passes the facet counts through so the category tabs can render", async () => {
    const body = await (await GET(new Request("http://localhost/api/audit?limit=20"))).json();

    // Field NAMES are independent literals: the mapper renaming or dropping a
    // facet fails here regardless of what the fixture holds. Exact set, not
    // `arrayContaining`: a leftover pre-v0.3.1 key (`auth`, `roles`, `block`,
    // `integration`) is a chip count nothing renders.
    expect(Object.keys(body.facets).sort()).toEqual(["all", "maintenance", "settings", "sign_in", "users"]);
    for (const [key, value] of Object.entries(body.facets)) {
      expect(typeof value, `facets.${key}`).toBe("number");
    }
  });

  it("records the regrouped facet keys on the wire, every one a number", () => {
    // The backend side of the same contract, read from the capture itself: the
    // v0.3.1 regroup renamed the keys, and a capture still carrying the old ones
    // means the fixture predates the backend the UI ships with. A string here is
    // the normaliser masking a count (it once turned `auth` into
    // "<redacted-auth>"), which would make the fixture describe a wire that
    // never existed.
    const facets = (wire.facets ?? {}) as Record<string, unknown>;

    expect(Object.keys(facets).sort()).toEqual(["all", "maintenance", "settings", "sign_in", "users"]);
    for (const [key, value] of Object.entries(facets)) {
      expect(typeof value, `facets.${key}`).toBe("number");
    }
  });

  it("counts every recorded action under exactly one category, so the categories sum to `all`", () => {
    // Since the regroup no action is All-only on the backend: the four category
    // counters partition `all`. If this breaks on a fresh capture, the backend
    // writes an action its category map does not know (or the UI now ships
    // against a backend that left one out) — a row the operator can only find
    // under All.
    const { all, sign_in, users, settings, maintenance } = wire.facets ?? {};

    expect(all).toBeGreaterThan(0);
    expect((sign_in ?? 0) + (users ?? 0) + (settings ?? 0) + (maintenance ?? 0)).toBe(all);
  });
});

/**
 * Security review S2 rework (backend b4a9e73). With no secret re-entry demanded
 * when a notify destination changes, `integration.updated` is the record of who
 * moved it, from where, to where — and these rows used to be dropped whole as
 * unknown actions. Separate, transcribed fixture: see its manifest entry.
 */
describe("GET /api/audit — integration rows", () => {
  const integrationWire = readWireFixture<AuditLogResponseDto>("audit-log-integration.json");

  async function integrationEvents() {
    backendRequest.mockResolvedValueOnce(integrationWire);
    const body = await (await GET(new Request("http://localhost/api/audit?limit=20"))).json();
    return body.events as { action: string; entity_id?: string; metadata?: { changes?: unknown[] } }[];
  }

  it("reaches the client instead of being dropped as an unknown action", async () => {
    const events = await integrationEvents();

    expect(events.map((e) => e.action)).toEqual([
      "integration.created",
      "integration.updated",
      "integration.deleted",
    ]);
  });

  it("carries the update's diff, including a secret named with no value", async () => {
    const updated = (await integrationEvents()).find((e) => e.action === "integration.updated");

    expect(updated?.metadata?.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "api_url", old: expect.any(String), new: expect.any(String) }),
        { field: "secrets.bot_token" },
      ]),
    );
  });
});

/**
 * RUK-297. Five actions the backend writes were dropped by the route as unknown:
 * the security log never showed a password change, a reset, a provider link, a
 * sign-in method toggle, or an admin editing someone's messenger tags. Captured
 * from the self-host stand — see the fixture's manifest entry for which row came
 * from where (the provider link is the REFUSED variant).
 */
describe("GET /api/audit — RUK-297 security events", () => {
  const securityWire = readWireFixture<AuditLogResponseDto>("audit-log-security-events.json");

  async function securityBody() {
    backendRequest.mockResolvedValueOnce(securityWire);
    return (await GET(new Request("http://localhost/api/audit?limit=20"))).json() as Promise<{
      events: {
        id: string;
        action: string;
        entity_id?: string;
        details?: string;
        metadata?: { ip?: string; failure_reason?: string; target_email?: string; changes?: unknown[] };
      }[];
      total: number;
    }>;
  }

  it("delivers every one of the five actions, and every recorded row", async () => {
    const body = await securityBody();

    // Literal action names — the set this ticket is about, not read back out of
    // the fixture.
    expect(new Set(body.events.map((e) => e.action))).toEqual(
      new Set([
        "auth_method.toggled",
        "password.changed",
        "password.reset",
        "provider.linked",
        "user.tags_changed",
      ]),
    );
    expect(body.events).toHaveLength((securityWire.logs ?? []).length);
  });

  it("carries the tag diff of user.tags_changed, both one-sided and two-sided", async () => {
    const tags = (await securityBody()).events.filter((e) => e.action === "user.tags_changed");

    expect(tags.length).toBeGreaterThan(0);
    for (const row of tags) expect(row.metadata?.target_email).toEqual(expect.any(String));
    const changes = tags.flatMap((row) => row.metadata?.changes ?? []);
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "telegram_tag", old: expect.any(String), new: expect.any(String) }),
        expect.objectContaining({ field: "slack_tag", new: expect.any(String) }),
      ]),
    );
  });

  it("keeps the sign-in context on credential events and the reason on a refused link", async () => {
    const events = (await securityBody()).events;

    for (const action of ["password.changed", "password.reset", "provider.linked"]) {
      const row = events.find((e) => e.action === action);
      expect(row?.metadata?.ip, action).toEqual(expect.any(String));
    }
    expect(events.find((e) => e.action === "provider.linked")?.metadata?.failure_reason).toEqual(
      expect.any(String),
    );
  });

  it("names the method a sign-in method toggle acted on", async () => {
    const toggled = (await securityBody()).events.find((e) => e.action === "auth_method.toggled");

    // `entity_id` is the method; the UI shows it as the target.
    expect(toggled?.entity_id).toMatch(/^email_(otp|password)$/);
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
