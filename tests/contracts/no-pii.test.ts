import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Committed fixtures must carry no unmasked identifiers — RUK-254.
 *
 * These files are recorded backend responses living in git, and the masking that
 * keeps them safe is a normaliser in `scripts/refresh-fixtures.mjs`. Twice now
 * that normaliser has had a hole, and both times a HUMAN found it:
 *
 *   1. `ip` and `user_agent` were committed verbatim, because masking matched
 *      value SHAPES and neither is UUID-, ISO- nor email-shaped.
 *   2. `manifest.json` carried 31 real addresses and 81 raw UUIDs, because
 *      `collectValueDomains` ran before normalisation and wrote its output
 *      straight out — a side door past the defence.
 *
 * A leak reaching `main` is not fixed by a later commit: the blob stays in
 * history. So the check runs here, in milliseconds, with no backend, and turns
 * "someone notices in review" into a red build. It is deliberately blunt —
 * false positives are cheap, a third leak is not.
 */

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/wire");

/**
 * `capturedAt` in the manifest is a real timestamp, and it is meant to be:
 * it records WHEN the capture ran, which is metadata about the recording rather
 * than data from the response.
 */
const ALLOWED = [/"capturedAt":\s*"[^"]+"/g];

const FORBIDDEN: readonly { name: string; pattern: RegExp }[] = [
  { name: "email address", pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g },
  { name: "raw UUID", pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi },
  { name: "IPv4 address", pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g },
  { name: "JWT", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { name: "user agent", pattern: /Mozilla\/\d|AppleWebKit\/\d/g },
  { name: "bearer token", pattern: /\bBearer\s+[A-Za-z0-9._-]{16,}/g },
];

function fixtureFiles(): string[] {
  return readdirSync(FIXTURE_DIR).filter((name) => name.endsWith(".json"));
}

describe("committed wire fixtures carry no unmasked identifiers", () => {
  const files = fixtureFiles();

  it("finds fixtures to check", () => {
    // Guards the guard: a renamed directory would leave every case below
    // iterating nothing and passing, which is how this class of check quietly
    // stops checking.
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    describe(file, () => {
      let content = readFileSync(join(FIXTURE_DIR, file), "utf8");
      for (const allowed of ALLOWED) content = content.replace(allowed, "");

      for (const { name, pattern } of FORBIDDEN) {
        it(`carries no ${name}`, () => {
          const hits = [...new Set(content.match(pattern) ?? [])];

          // The failure quotes what it found, so the fix is obvious: add the key
          // to `SENSITIVE_KEY_RE`, or extend the normaliser to reach the value.
          expect(`${file} — ${name}: ${hits.slice(0, 3).join(", ") || "none"}`).toBe(
            `${file} — ${name}: none`,
          );
        });
      }
    });
  }
});
