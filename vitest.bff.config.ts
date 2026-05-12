import { defineConfig } from "vitest/config";

import { baseTestConfig } from "./vitest.config";

// BFF layer: Next.js route handlers under `src/app/api/**` and the backend
// client/config that sits behind them. `fetch` is always stubbed at the
// network boundary — no test in this set should reach a real backend.
export default defineConfig({
  ...baseTestConfig,
  test: {
    ...baseTestConfig.test,
    include: [
      "src/app/api/**/__tests__/**/*.test.ts",
      "src/server/backend/__tests__/**/*.test.ts",
      "src/server/backend/client/__tests__/**/*.test.ts",
    ],
  },
});
