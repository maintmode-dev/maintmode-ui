import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Base Vitest config — `@/*` path alias only. Layer-specific configs
// (e.g. vitest.unit.config.ts) extend this to scope their include glob.
export const baseTestConfig = {
  resolve: {
    alias: [
      {
        find: /^@\/(.*)$/,
        replacement: `${fileURLToPath(new URL("./src/", import.meta.url))}$1`,
      },
      {
        find: /^server-only$/,
        replacement: fileURLToPath(new URL("./src/shared/testing/server-only-stub.ts", import.meta.url)),
      },
    ],
  },
  test: {
    environment: "node" as const,
  },
};

export default defineConfig({
  ...baseTestConfig,
  test: {
    ...baseTestConfig.test,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
