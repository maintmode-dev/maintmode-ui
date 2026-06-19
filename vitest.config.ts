import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Pin a fixed, non-UTC timezone for the whole test run. Two reasons:
//  1. Determinism — date-dependent tests must not pass/fail based on the
//     contributor's or CI runner's local zone.
//  2. The calendar's hydration (#418) regression guard only bites when the
//     runner's local day can diverge from the UTC day. GitHub-hosted runners
//     default to UTC, where a buggy local-reading implementation looks correct,
//     so an unpinned suite would silently stop guarding the fix. A non-UTC zone
//     guarantees the divergence exists. Asia/Nicosia is UTC+2/+3 (DST), a
//     positive offset that makes a late-in-UTC-day instant fall on the next
//     local day — exactly the boundary that tripped #418.
process.env.TZ = "Asia/Nicosia";

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
