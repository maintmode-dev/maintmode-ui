import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * DTO ↔ wire reconciliation — RUK-254, SPEC-RUK-254.md §4.2 (revised).
 *
 * ## Why this replaced a staleness timer
 *
 * The plan originally called for failing the build when fixtures were older than
 * 30 days. Three things killed it. It fires on the CALENDAR, so it lands on a PR
 * that changed nothing related. CI cannot satisfy it — refreshing needs a
 * backend on :9000, which CI deliberately does not have (SPEC §5.2). And the fix
 * is one command, so it decays into a reflex `fixtures:refresh && git commit`
 * with nobody reading the diff — the same unobservable trigger SPEC §1.3 is
 * about.
 *
 * The obvious causal replacement — "you touched a DTO, so refresh the fixtures"
 * — is also wrong, and subtly. A DTO edit is a FRONTEND-side change; the backend
 * response is unchanged, so a refresh produces no diff at all. That gate would
 * demand an empty commit as proof of diligence, and gates that cannot be
 * satisfied honestly get bypassed.
 *
 * What actually carries the signal is the comparison itself: does the type we
 * declare still describe the bytes we recorded? That question needs no backend,
 * runs anywhere, and answers on cause rather than on elapsed time.
 *
 * ## The two directions are different defects
 *
 * DECLARED BUT ABSENT — the frontend believes in a field the backend does not
 * send. This is the class-B defect behind four of the five incidents
 * (`created_by_id`/RUK-192, structured `details`/RUK-171, `resources`/RUK-256).
 * It is reported as a gap, not a failure: some are known and tracked, and the
 * registry is where they live.
 *
 * ON WIRE BUT UNDECLARED — the backend sends something we never modelled. That
 * is drift arriving, and usually the first sight of a field we should consume.
 */

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/wire");
const DTO_FILE = join(process.cwd(), "src/server/backend/contracts/maintmode-dto.ts");

/**
 * Which DTO describes which recorded payload, and where inside it to look.
 *
 * `rowsAt` is the collection whose ELEMENTS the DTO describes; omit it when the
 * DTO describes the envelope itself.
 */
type Reconciliation = {
  /** Interface name in `maintmode-dto.ts`. */
  dto: string;
  /** Fixture file under `tests/fixtures/wire/`. */
  fixture: string;
  /** Property holding the object the DTO describes, when it is nested. */
  at?: string;
  /** Collection whose ELEMENTS the DTO describes. */
  rowsAt?: string;
};

const RECONCILIATIONS: Reconciliation[] = [
  { dto: "CalendarEventDto", fixture: "calendar.json", rowsAt: "events" },
  { dto: "CalendarViewResponseDto", fixture: "calendar.json" },
  { dto: "CalendarViewMetaDto", fixture: "calendar.json", at: "meta" },
  { dto: "MaintenanceViewResponseDto", fixture: "maintenance-detail.json" },
  { dto: "MaintenanceViewDto", fixture: "maintenance-detail.json", at: "maintenance" },
];

/**
 * Read the field names off a TypeScript interface.
 *
 * A regex rather than the TS compiler API on purpose: this must state what the
 * DTO literally declares. Resolving inheritance or generics would start
 * INFERRING, and an inference is another belief — the thing under test here.
 */
function declaredFields(source: string, interfaceName: string): { name: string; optional: boolean }[] {
  const match = source.match(new RegExp(`export interface ${interfaceName} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`interface ${interfaceName} not found in maintmode-dto.ts`);
  const fields = [...match[1].matchAll(/^\s{2}(\w+)(\??):/gm)].map((m) => ({
    name: m[1],
    optional: m[2] === "?",
  }));

  // A regex parser fails SILENTLY, and that is the dangerous direction: a block
  // comment containing `}` at column zero ends the match early, `declaredFields`
  // returns a truncated list, and every reconciliation below then passes having
  // compared almost nothing. An empty list is the unmistakable symptom, so it is
  // an error rather than a quietly green run.
  if (fields.length === 0) {
    throw new Error(
      `parsed ZERO fields from ${interfaceName} — the interface body did not parse ` +
        `(a comment with '}' at column zero, or 'extends', will do this). ` +
        `Fix the parser rather than trusting this run.`,
    );
  }
  return fields;
}

/** Field names actually present across the recorded payload. */
function wireFields(
  fixture: Record<string, unknown>,
  spec: { readonly at?: string; readonly rowsAt?: string },
): string[] {
  if (spec.rowsAt) {
    const rows = (fixture[spec.rowsAt] ?? []) as Record<string, unknown>[];
    // Union across all rows: one row omitting an optional field must not read as
    // the backend having dropped it.
    return [...new Set(rows.flatMap((row) => Object.keys(row)))];
  }
  const target = (spec.at ? fixture[spec.at] : fixture) as Record<string, unknown> | undefined;
  return target ? Object.keys(target) : [];
}

const dtoSource = readFileSync(DTO_FILE, "utf8");

describe("DTO ↔ wire reconciliation", () => {
  for (const spec of RECONCILIATIONS) {
    describe(spec.dto, () => {
      const fixture = JSON.parse(readFileSync(join(FIXTURE_DIR, spec.fixture), "utf8"));
      const declared = declaredFields(dtoSource, spec.dto);
      const onWire = wireFields(fixture, spec);

      it("declares no REQUIRED field the recorded response omits", () => {
        // Only non-optional fields are gated. An optional field missing from a
        // capture is usually the contract working as designed: this fixture is a
        // DRAFT maintenance, so `actual_time_start`/`actual_time_end` are
        // legitimately absent — the window has not begun. Failing on those would
        // make the check cry wolf on correct data, and a check that cries wolf
        // gets muted. Optional-but-never-seen fields are reported below instead,
        // where they are information rather than a verdict.
        const phantom = declared.filter((field) => !field.optional && !onWire.includes(field.name));

        // Asserted as text so the failure names the fields instead of printing
        // `false !== true`. A phantom required field means code downstream reads
        // `undefined` forever while the types promise a value.
        expect(
          `${spec.dto} missing required fields: ${phantom.map((f) => f.name).join(", ") || "none"}`,
        ).toBe(`${spec.dto} missing required fields: none`);
      });

      it("reports optional fields never seen on the wire (class-B candidates)", () => {
        // Not a failure — a census. An optional field absent from every record
        // is either "the state was not in this capture" or "the backend never
        // sends it", and only a human can tell those apart. Surfacing it is how
        // a belief like `resources` (RUK-256) stops being invisible; the
        // registry is where the answer gets written down.
        const neverSeen = declared.filter((field) => field.optional && !onWire.includes(field.name));

        if (neverSeen.length) {
          console.warn(
            `[contracts] ${spec.dto}: optional field(s) absent from this capture — ` +
              `${neverSeen.map((f) => f.name).join(", ")}. Confirm whether the backend sends them at all.`,
          );
        }
        expect(declared.length).toBeGreaterThan(0);
      });

      it("models every field the recorded response carries", () => {
        const declaredNames = declared.map((field) => field.name);
        const unmodelled = onWire.filter((field) => !declaredNames.includes(field));

        expect(`${spec.dto} unmodelled wire fields: ${unmodelled.join(", ") || "none"}`).toBe(
          `${spec.dto} unmodelled wire fields: none`,
        );
      });
    });
  }
});

describe("fixture capture age (advisory)", () => {
  /**
   * Deliberately NOT a build gate — see the header. A capture this old is worth
   * a look, but time alone is not evidence that anything drifted, and failing a
   * PR over it teaches people to silence the check rather than read it.
   */
  const ADVISORY_AGE_DAYS = 90;

  it("reports fixtures older than the advisory window without failing", () => {
    const manifest = JSON.parse(readFileSync(join(FIXTURE_DIR, "manifest.json"), "utf8"));
    const now = Date.now();

    const stale = Object.entries(manifest.endpoints as Record<string, { capturedAt: string }>)
      .map(([name, entry]) => ({
        name,
        ageDays: Math.floor((now - Date.parse(entry.capturedAt)) / 86_400_000),
      }))
      .filter((entry) => entry.ageDays > ADVISORY_AGE_DAYS);

    if (stale.length) {
      console.warn(
        `[contracts] ${stale.length} fixture(s) older than ${ADVISORY_AGE_DAYS} days: ` +
          `${stale.map((s) => `${s.name} (${s.ageDays}d)`).join(", ")}. ` +
          `Run \`npm run fixtures:refresh\` against a local backend when convenient.`,
      );
    }

    // The assertion is that the manifest is READABLE and dated — that much is a
    // real precondition. Age itself only warns.
    expect(Object.keys(manifest.endpoints).length).toBeGreaterThan(0);
  });
});
