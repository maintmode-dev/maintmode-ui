/**
 * Vendor the backend's published audit-action enum — RUK-297.
 *
 * `AUDIT_ACTIONS` (src/domain/audit/audit-log.ts) is a hand-written list, and it
 * fell five actions behind the backend without anything noticing: the route
 * dropped every row it did not know, on a 200, with no error. The guard is
 * `tests/contracts/audit-actions.contract.test.ts`, which compares that list
 * with the enum the backend PUBLISHES — `entity.AuditAction` in the auth
 * service's OpenAPI spec.
 *
 * That spec lives in the backend repository, and CI here cannot read a sibling
 * checkout. It is not on the wire either: the backend serves its spec on the
 * infra port, which no gateway exposes, so `fixtures:refresh` cannot capture it.
 * So the schema is VENDORED, the way the wire fixtures are: copied verbatim by a
 * script, never typed by hand, and declared in the manifest with the backend
 * commit it came from.
 *
 * Usage (from this repo, with the backend checked out beside it):
 *   npm run fixtures:audit-actions
 *   MAINTMODE_BACKEND_DIR=/path/to/maintmode npm run fixtures:audit-actions
 *
 * Then run `npm run test:contracts`. A red `audit-actions` test after a sync
 * means the backend added or removed an action: model it (label, colour,
 * category in src/domain/audit/audit-presentation.ts), do not edit the
 * vendored file.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const backendDir = resolve(process.env.MAINTMODE_BACKEND_DIR ?? join(root, "..", "maintmode"));
const SPEC_PATH = "docs/auth/swagger.json";
const SCHEMA = "entity.AuditAction";
const NAME = "audit-action-enum";
const outPath = join(root, "tests/fixtures/wire", `${NAME}.json`);
const manifestPath = join(root, "tests/fixtures/wire/manifest.json");

const specFile = join(backendDir, SPEC_PATH);
if (!existsSync(specFile)) {
  console.error(
    `no backend spec at ${specFile}.\n` +
      `  Check out the backend beside this repo, or set MAINTMODE_BACKEND_DIR.\n` +
      `  Contract tests do NOT need this — they read the committed copy.`,
  );
  process.exit(1);
}

const spec = JSON.parse(readFileSync(specFile, "utf8"));
const schema = spec.components?.schemas?.[SCHEMA];
if (!schema || !Array.isArray(schema.enum) || schema.enum.length === 0) {
  console.error(
    `${SPEC_PATH} carries no non-empty components.schemas["${SCHEMA}"].enum — refusing to write.`,
  );
  process.exit(1);
}

function backendCommit() {
  try {
    const sha = execFileSync("git", ["-C", backendDir, "rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
    }).trim();
    const dirty = execFileSync("git", ["-C", backendDir, "status", "--porcelain", "--", SPEC_PATH], {
      encoding: "utf8",
    }).trim();
    return dirty ? `${sha} (with uncommitted changes to ${SPEC_PATH})` : sha;
  } catch {
    return "unknown (not a git checkout)";
  }
}

const commit = backendCommit();

// Verbatim: the schema object as published, nothing added inside it.
writeFileSync(outPath, `${JSON.stringify({ [SCHEMA]: schema }, null, 2)}\n`);

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.endpoints[NAME] = {
  url: `maintmode:${SPEC_PATH}#/components/schemas/${SCHEMA}`,
  method: "SPEC",
  status: "n/a",
  capturedAt: new Date().toISOString().slice(0, 10),
  why: "RUK-297: AUDIT_ACTIONS fell five actions behind the backend and the route dropped those rows silently. audit-actions.contract.test.ts compares the UI list with this published enum, so the next new action fails CI instead of vanishing from the security log.",
  handEdited: false,
  capturedBy:
    "npm run fixtures:audit-actions (scripts/sync-audit-actions.mjs) — copied verbatim from the backend checkout, not from the wire: the spec is served on the backend's infra port, which no gateway exposes.",
  backendCommit: commit,
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`  ✓ ${NAME}: ${schema.enum.length} actions from ${SPEC_PATH} @ ${commit}`);
