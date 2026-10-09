/** Types for the parts of `refresh-fixtures.mjs` that tests import. */

export function normalize(
  value: unknown,
  seen?: Map<string, string>,
  key?: string,
  counters?: Map<string, number>,
  personName?: boolean,
): unknown;

export function collectValueDomains(rows: unknown[]): Record<string, string[]>;
