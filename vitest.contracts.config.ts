import { defineConfig } from "vitest/config";

import { baseTestConfig } from "./vitest.config";

/**
 * Contract suite — RUK-254, SPEC-RUK-254.md §4.6.
 *
 * Separate from `test:unit` on purpose. Before this existed, `test:contracts`
 * ran `check-boundaries.mjs` — an import-layer linter — so a reviewer looking at
 * a green `verify` could reasonably conclude FE↔BE contracts were covered. They
 * were covered by nothing: 3 of 40 BFF routes had a route-level test, and every
 * hook test replaced `bffFetch` wholesale, so the proxy deciding what actually
 * reaches the backend was never executed. Five drift incidents reached
 * production through that gap.
 *
 * Keeping this as its own command means "contracts are green" is a signal a
 * reviewer can read, rather than four tests dissolved into a 1022-test run.
 *
 * Tests live under `tests/contracts/` rather than `src/**` so the unit config's
 * globs cannot pick them up and quietly run them twice.
 */
export default defineConfig({
  ...baseTestConfig,
  test: {
    ...baseTestConfig.test,
    include: ["tests/contracts/**/*.test.ts"],
  },
});
