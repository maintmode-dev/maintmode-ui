import { defineConfig } from "vitest/config";

import { baseTestConfig } from "./vitest.config";

// Pure logic layer: utils, adapters, schemas, query keys, shared config.
// MUST NOT include `src/app/api/**` (BFF routes — those live in the bff
// layer) or any test that boots Next route handlers.
export default defineConfig({
  ...baseTestConfig,
  test: {
    ...baseTestConfig.test,
    include: [
      "src/features/**/__tests__/**/*.test.ts",
      "src/features/**/*.test.ts",
      "src/shared/**/__tests__/**/*.test.ts",
      "src/server/backend/maintenance/__tests__/**/*.test.ts",
      "src/server/backend/errors/__tests__/**/*.test.ts",
    ],
  },
});
