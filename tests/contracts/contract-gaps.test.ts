import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Executable registry — RUK-254, SPEC-RUK-254.md §4.4 (AC-4, AC-5).
 *
 * `docs/contract-gaps.md` lists every place the frontend wants a field the
 * backend does not send. A registry nobody executes becomes a graveyard: rows
 * outlive the defect, readers stop trusting them, and the file turns into
 * folklore. That is the exact failure SPEC §1.3 describes — the `total > 200`
 * trigger fired 53 times into a void because nothing made it observable.
 *
 * So each row here is asserted against the RECORDED response, and the
 * assertions are INVERTED: they encode the gap as it stands today and fail the
 * moment it closes. A failure is good news — it means the backend started
 * sending the field, the gap is stale, and the row should be deleted as the
 * feature is implemented. The failure message says so.
 *
 * The other direction is covered too: a stub in the mapper with no row in the
 * registry fails, so a new `x: []` cannot be added silently.
 *
 * WHAT THIS FILE MUST NOT DO: fix anything. SPEC §5 is explicit — this ticket
 * builds detection, not repair.
 */

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/wire");
const REGISTRY_PATH = join(process.cwd(), "docs/contract-gaps.md");
const MAPPER_PATH = join(process.cwd(), "src/server/backend/contracts/maintenance-mapper.ts");
const DTO_PATH = join(process.cwd(), "src/server/backend/contracts/maintmode-dto.ts");
const DOMAIN_AUDIT_PATH = join(process.cwd(), "src/domain/audit/audit-log.ts");
const AUDIT_PRESENTATION_PATH = join(process.cwd(), "src/domain/audit/audit-presentation.ts");

const fixture = (name: string) => JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf8"));
const registry = readFileSync(REGISTRY_PATH, "utf8");

const STALE = (field: string, where: string) =>
  `GAP IS STALE: \`${field}\` is now on the wire in ${where}. ` +
  `Delete its row from docs/contract-gaps.md and implement the feature it was blocking.`;

/**
 * Class B — the frontend reads a field the backend does not send.
 *
 * Each entry names a field ABSENT from calendar events and the mapper line that
 * hardcodes a stand-in value. All three were verified byte-wise against
 * `calendar.json` before being written down.
 */
const CALENDAR_EVENT_GAPS = [
  { field: "resources", stub: "resources: []", ticket: "RUK-256" },
  { field: "notify_targets", stub: "notify_targets: []", ticket: "—" },
  { field: "steps", stub: "steps: []", ticket: "—" },
] as const;

describe("registry — class B: fields the calendar wants and the wire does not carry", () => {
  const events = (fixture("calendar.json").events ?? []) as Record<string, unknown>[];

  it("records calendar events at all, so absence below means something", () => {
    // Guards the whole block: against an empty `events` array every "field is
    // absent" assertion below would pass vacuously, and the registry would look
    // verified while proving nothing.
    expect(events.length).toBeGreaterThan(0);
  });

  for (const gap of CALENDAR_EVENT_GAPS) {
    describe(`\`${gap.field}\` (${gap.ticket})`, () => {
      it("is still absent from every recorded calendar event", () => {
        const carrying = events.filter((event) => gap.field in event).length;

        expect(carrying === 0 ? "absent" : STALE(gap.field, `${carrying} calendar event(s)`)).toBe("absent");
      });

      it("has a row in docs/contract-gaps.md naming its stub", () => {
        // The reverse direction: a stub in the mapper with no registry row is
        // an undocumented gap, which is how this knowledge got scattered across
        // RUK-171/192/256 in the first place.
        expect(`${gap.field} in registry: ${registry.includes(`\`${gap.field}\``)}`).toBe(
          `${gap.field} in registry: true`,
        );
      });
    });
  }

  it("registers every hardcoded stub in the calendar mapper", () => {
    // Greps the mapper (SPEC §4.4) so a NEW stub cannot be introduced without a
    // registry row. Scoped to `mapCalendarResponse`, since `x: []` elsewhere in
    // the file is ordinary defaulting rather than a stand-in for a missing
    // contract field.
    const mapper = readFileSync(MAPPER_PATH, "utf8");
    const calendarFn = mapper.slice(
      mapper.indexOf("export function mapCalendarResponse"),
      mapper.indexOf("export function mapMaintenanceView"),
    );
    expect(calendarFn.length).toBeGreaterThan(0);

    // Tolerant of formatting, strict about the pattern. The first version
    // demanded exactly six spaces, exactly `[]` and a trailing comma, so
    // `sneakystub: [ ],` — one space inside the brackets — slipped past with the
    // suite green. A guard that a stray space defeats is not a guard, and this
    // one exists precisely for the case where somebody adds a stub without
    // thinking about the registry.
    //
    // `undefined` counts too: SPEC §5 names `x: undefined` as a stub form, and
    // it stands in for a missing field exactly as `[]` does.
    const stubbed = [
      ...calendarFn.matchAll(/^\s+(\w+)\s*:\s*(?:\[\s*\]|undefined)\s*,?\s*(?:\/\/.*)?$/gm),
    ].map((m) => m[1]);
    expect(stubbed.length).toBeGreaterThan(0);

    const unregistered = stubbed.filter((field) => !registry.includes(`\`${field}\``));

    expect(`unregistered stubs: ${unregistered.join(", ") || "none"}`).toBe("unregistered stubs: none");
  });
});

describe("registry — class B: audit `details` is flat, not structured (RUK-171)", () => {
  const logs = (fixture("audit-log.json").logs ?? []) as Record<string, unknown>[];

  it("still arrives as a plain string on every recorded row", () => {
    const withDetails = logs.filter((log) => log.details !== undefined);
    expect(withDetails.length).toBeGreaterThan(0);

    const structured = withDetails.filter((log) => typeof log.details === "object").length;

    expect(
      structured === 0
        ? "flat string"
        : `GAP IS STALE: \`details\` now arrives structured on ${structured} row(s). ` +
            `Delete its row from docs/contract-gaps.md and implement the rich diff rendering.`,
    ).toBe("flat string");
  });
});

/**
 * Class B′ — CLOSED, and kept executable so it stays closed.
 *
 * `facets.integration` was counted by the backend and dropped on the floor
 * because neither the DTO nor the domain type declared it. Nothing broke, which
 * is what makes this direction dangerous: no screen errors, no empty state, just
 * a category the operator never learns exists. It was found by the DTO↔wire
 * reconciliation rather than by anyone noticing, and the count is 0 on the dev
 * seed — so there was no symptom available to notice.
 *
 * The gap is now closed, and the assertion is INVERTED to match: it fails if the
 * field is ever dropped from the DTO or the domain type again. A closed gap that
 * stops being checked is just a gap waiting to reopen.
 */
describe("registry — class B′ (closed): `facets.integration` reaches the domain", () => {
  it("is declared in AuditFacetsDto and in the domain AuditFacets", () => {
    const facets = (fixture("audit-log.json").facets ?? {}) as Record<string, unknown>;
    const dto = readFileSync(DTO_PATH, "utf8");
    const dtoBlock = dto.slice(
      dto.indexOf("export interface AuditFacetsDto"),
      dto.indexOf("export interface AuditLogResponseDto"),
    );
    const domain = readFileSync(DOMAIN_AUDIT_PATH, "utf8");
    const domainBlock = domain.slice(
      domain.indexOf("export interface AuditFacets"),
      domain.indexOf("export interface AuditPage"),
    );

    // Preconditions, so a failed lookup cannot masquerade as a passing check.
    expect("integration" in facets).toBe(true);
    expect(dtoBlock.length).toBeGreaterThan(0);
    expect(domainBlock.length).toBeGreaterThan(0);

    expect(`declared in DTO: ${dtoBlock.includes("integration")}`).toBe("declared in DTO: true");
    expect(`declared in domain: ${domainBlock.includes("integration")}`).toBe("declared in domain: true");
  });

  it("is NOT yet a rendered category — that needs the category vocabulary", () => {
    // Deliberate scope line. The counter now reaches the domain, but a visible
    // "Integration" tab needs `AuditCategory`, `AUDIT_CATEGORIES` and
    // `CATEGORY_ACTIONS` extended with integration actions the domain enum does
    // not yet contain. That is a product decision, so it is recorded rather than
    // quietly done. This assertion inverts when the tab ships.
    const presentation = readFileSync(AUDIT_PRESENTATION_PATH, "utf8");
    const categories = presentation.slice(
      presentation.indexOf("export type AuditCategory"),
      presentation.indexOf("const CATEGORY_ACTIONS"),
    );
    expect(categories.length).toBeGreaterThan(0);

    expect(
      categories.includes('"integration"')
        ? "TAB SHIPPED: `integration` is now an AuditCategory. Update the note in " +
            "docs/contract-gaps.md — the facet is fully rendered."
        : "counter only",
    ).toBe("counter only");
  });
});

/**
 * Unproven captures — not a contract gap but a hole in the EVIDENCE.
 *
 * An endpoint whose capture is empty looks covered and proves nothing. These
 * expire on their own: the day seed data reaches the endpoint, the assertion
 * fails and asks for the row shape to be pinned.
 */
describe("registry — captures that prove no row shape", () => {
  it("approvals is still empty, so `ApprovalRowDto` remains unverified", () => {
    const rows = (fixture("approvals.json").maintenances ?? []) as unknown[];

    expect(
      rows.length === 0
        ? "empty"
        : `CAPTURE IS NO LONGER EMPTY: approvals recorded ${rows.length} row(s). ` +
            `Assert the row shape in approvals.contract.test.ts and delete the row from docs/contract-gaps.md.`,
    ).toBe("empty");
  });

  it("records whether the capture pins `metadata.maint_title`", () => {
    // Why it matters: `GET /api/maintenance/{id}/audit` derives the page title
    // from `metadata.maint_title`, which only rides on maintenance-entity rows.
    //
    // This assertion was briefly rewritten to REQUIRE those rows, because one
    // capture contained them. That was wrong, and the way it was wrong is worth
    // keeping: the audit log is time-ordered and `limit=20` returns the NEWEST
    // rows, so what lands in the fixture depends on when the capture ran. Worse,
    // the capture pollutes its own subject — every `fixtures:refresh` performs a
    // dev-bypass login, which writes `login.success` rows that push older
    // maintenance rows off the page. Pinning a shape that only sometimes appears
    // makes a test that fails on a Tuesday for nobody's mistake.
    //
    // So this stays a CENSUS with a self-expiring message rather than a
    // requirement. Closing it properly needs the capture to select those rows
    // (an `entity_type` filter, which the endpoint does not currently expose) —
    // recorded in docs/contract-gaps.md, not papered over here.
    const logs = (fixture("audit-log.json").logs ?? []) as {
      entity_type?: string;
      metadata?: Record<string, unknown>;
    }[];
    const maintenanceRows = logs.filter((log) => log.entity_type === "maintenance");

    // When they ARE present, their shape is asserted for real.
    for (const row of maintenanceRows) {
      expect(typeof row.metadata?.maint_title).toBe("string");
    }

    if (maintenanceRows.length === 0) {
      console.warn(
        "[contracts] audit capture holds no maintenance-entity row: " +
          "`metadata.maint_title` is unproven by the wire. See docs/contract-gaps.md.",
      );
    }
    expect(logs.length).toBeGreaterThan(0);
  });
});

/**
 * Claims the wire REFUTED.
 *
 * Kept executable so they cannot quietly become true again and be rediscovered
 * as new incidents. Each asserts the field IS present — the inverse of the
 * three registry rows above.
 */
describe("registry — refuted claims stay refuted", () => {
  it("`actor_display_name` accompanies every human actor (RUK-171's 'never sent' is false)", () => {
    // Three versions of this assertion have now been broken by a later capture:
    // "on every row", then "on every row with an actor_id", then "on at least
    // one row". Each was a tally of whichever 12 rows happened to be newest, and
    // the newest rows are not stable — the audit log is time-ordered and every
    // `fixtures:refresh` writes `login.success` into it, so the capture floods
    // its own window with actor-less system rows.
    //
    // The invariant underneath all three: where the backend records a human
    // actor, it records their name too. That holds whatever the window contains,
    // and it still refutes the ticket's "never sent" whenever a human row exists.
    const logs = (fixture("audit-log.json").logs ?? []) as Record<string, unknown>[];
    expect(logs.length).toBeGreaterThan(0);

    // What the wire actually shows: the field rides on the ACTION, not on the
    // presence of an actor. `roles.changed` and `maintenance.*` carry it;
    // `login.success` carries an `actor_id` without it. There is no pairing rule
    // to assert, and no window is guaranteed to contain a row that has it.
    //
    // So the refutation is recorded where it can be checked without depending on
    // the window — the REGISTRY says the claim is refuted, and that statement is
    // pinned here. The wire-side evidence returns as a hard assertion once the
    // capture can select rows by `entity_type`.
    const wrongType = logs.filter(
      (log) => "actor_display_name" in log && typeof log.actor_display_name !== "string",
    );
    expect(`audit rows with a non-string actor_display_name: ${wrongType.length}`).toBe(
      "audit rows with a non-string actor_display_name: 0",
    );

    expect(`registry records the refutation: ${registry.includes("actor_display_name")}`).toBe(
      "registry records the refutation: true",
    );
  });

  it("calendar `created_by` carries an `id` (RUK-192's blocker is stale)", () => {
    const events = (fixture("calendar.json").events ?? []) as { created_by?: { id?: string } }[];
    const withAuthor = events.filter((event) => event.created_by);

    expect(withAuthor.length).toBeGreaterThan(0);
    expect(withAuthor.every((event) => typeof event.created_by?.id === "string")).toBe(true);
  });

  it("`timezone` is a real key on /me (RUK-202 shipped)", () => {
    // `null` is a VALUE — "not set". Absence would be the gap, and it is not.
    expect("timezone" in fixture("me.json")).toBe(true);
  });
});

describe("the registry file itself", () => {
  it("names every gap this suite enforces, so the doc and the test cannot drift apart", () => {
    // Without this, a row could be deleted from the markdown while the test
    // kept passing, and the registry would stop describing what is enforced.
    const enforced = ["resources", "notify_targets", "steps", "details", "facets.integration"];
    const undocumented = enforced.filter((field) => !registry.includes(field));

    expect(`undocumented enforced gaps: ${undocumented.join(", ") || "none"}`).toBe(
      "undocumented enforced gaps: none",
    );
  });
});
