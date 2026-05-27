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
    ],
  },
});
