import { expect } from "vitest";

/**
 * Shared wire assertions — RUK-254.
 *
 * ## Why presence is not enough
 *
 * The first version of every contract test asked `field in row` and reported
 * "missing from 0 of N". A mutation audit showed what that misses: rewriting
 * `me.id` to `999`, `email` to `42` and `display_name` to `null` left all 105
 * tests green. So did `calendar.id` as a number, `approvals.total` as a string,
 * and `me.timezone` as `{}`.
 *
 * That is not a hypothetical. The backend is Go: a zero value serialises to `0`
 * or `""` rather than being omitted, an `omitempty` added or removed flips a
 * field between "absent" and "empty", and a `string` id becoming numeric is a
 * one-line change upstream. Every one of those reaches the mapper, which coerces
 * quietly, and the screen renders something wrong with no test objecting.
 *
 * Presence and type are therefore asserted together, and the failure message
 * names the field, the expected type and what actually arrived — so someone who
 * did not write the test can act on it.
 */

/** What a field is allowed to be on the wire. */
export type WireType = "string" | "number" | "boolean" | "object" | "array";

/** A required field: present on every row, and of this type. */
export type FieldSpec = readonly [name: string, type: WireType];

function actualType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * Assert that every row carries every required field with the right type.
 *
 * `label` names the collection in failures ("calendar events", "audit rows") so
 * a failure in a suite covering several shapes says which one broke.
 *
 * Rows being empty is itself a failure. A test that iterates an empty array
 * asserts nothing and passes — `[].every(...)` is `true` — which is how a
 * capture that returned no rows can read as a covered endpoint.
 */
export function expectWireFields(
  rows: readonly Record<string, unknown>[],
  fields: readonly FieldSpec[],
  label: string,
): void {
  expect(`${label}: ${rows.length} row(s)`).not.toBe(`${label}: 0 row(s)`);

  for (const [name, type] of fields) {
    // Absence and wrong type are reported separately: they are different
    // defects. A missing field is usually a rename; a wrong type is usually a
    // serialisation change upstream, and it is the one that slips through.
    const missing = rows.filter((row) => !(name in row)).length;
    expect(`${label}.${name}: missing from ${missing} of ${rows.length}`).toBe(
      `${label}.${name}: missing from 0 of ${rows.length}`,
    );

    const wrongType = rows
      .filter((row) => name in row)
      .map((row) => actualType(row[name]))
      .filter((seen) => seen !== type);

    expect(
      `${label}.${name}: ${wrongType.length ? `got ${[...new Set(wrongType)].sort().join("|")}` : type}`,
    ).toBe(`${label}.${name}: ${type}`);
  }
}

/**
 * Assert a nullable field: the KEY is always present, the value is the given
 * type or `null`.
 *
 * The distinction matters and is easy to lose. `timezone: null` means "the user
 * has not chosen one"; a missing `timezone` key means the backend does not model
 * timezones at all. RUK-202 was filed on the second reading when the first was
 * true.
 */
export function expectNullableWireFields(
  rows: readonly Record<string, unknown>[],
  fields: readonly FieldSpec[],
  label: string,
): void {
  expect(`${label}: ${rows.length} row(s)`).not.toBe(`${label}: 0 row(s)`);

  for (const [name, type] of fields) {
    const missing = rows.filter((row) => !(name in row)).length;
    expect(`${label}.${name}: key missing from ${missing} of ${rows.length}`).toBe(
      `${label}.${name}: key missing from 0 of ${rows.length}`,
    );

    const wrongType = rows
      .filter((row) => name in row)
      .map((row) => actualType(row[name]))
      .filter((seen) => seen !== type && seen !== "null");

    expect(
      `${label}.${name}: ${wrongType.length ? `got ${[...new Set(wrongType)].sort().join("|")}` : `${type}|null`}`,
    ).toBe(`${label}.${name}: ${type}|null`);
  }
}
