import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Base Vitest config — shared aliases/stubs only. The `include` glob is set
// by the layer-specific configs (`vitest.unit.config.ts` and
// `vitest.bff.config.ts`) so they can scope each test layer cleanly.
//
// Default export still works for `vitest:watch` against the whole tree because
// the include below catches every `*.test.ts` under src and tests.

export const baseTestConfig = {
  resolve: {
    alias: [
      {
        find: /^@\/server\/auth\/session-token$/,
        replacement: fileURLToPath(new URL("./tests/stubs/session-token.ts", import.meta.url)),
      },
      {
        find: /^@\/server\/auth\/auth-config$/,
        replacement: fileURLToPath(new URL("./tests/stubs/auth-config.ts", import.meta.url)),
      },
      {
        find: /^@\/(.*)$/,
        replacement: `${fileURLToPath(new URL("./src/", import.meta.url))}$1`,
      },
      {
        find: /^server-only$/,
        replacement: fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
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
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
