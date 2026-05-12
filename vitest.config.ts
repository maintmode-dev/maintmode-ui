import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
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
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
