import { defineConfig } from "vitest/config";

import { baseTestConfig } from "./vitest.config";

// Unit + component tests. Tests under `src/shared/ui/**/__tests__/` opt into
// jsdom via a `// @vitest-environment jsdom` directive at the top of the file
// (vitest v4 dropped `environmentMatchGlobs`). Everything else runs in node.
export default defineConfig({
  ...baseTestConfig,
  test: {
    ...baseTestConfig.test,
    include: [
      "src/domain/**/__tests__/**/*.test.{ts,tsx}",
      "src/features/**/__tests__/**/*.test.{ts,tsx}",
      "src/shared/**/__tests__/**/*.test.{ts,tsx}",
      "src/server/**/__tests__/**/*.test.{ts,tsx}",
      // Route shells and app chrome (`AppHeader`'s role-gated nav, RUK-215).
      // Without this line a test under `src/app/**` is silently never run —
      // vitest does not report a non-matching file at all, so it looks like a
      // passing suite rather than a missing one.
      "src/app/**/__tests__/**/*.test.{ts,tsx}",
    ],
  },
});
