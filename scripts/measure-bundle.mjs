/**
 * Per-route bundle measurement harness.
 *
 * Reads the route -> chunk map out of a production build and prints, for every
 * app route, the chunks that route pulls in eagerly on top of the shared
 * baseline, in raw and gzip bytes. This is the "before/after" instrument: run it
 * on a clean tree, run it again after a change, diff the two text files.
 *
 * Method (see docs/specs/perf-remediation.md 1.2):
 *   - `.next/server/app/ **\/page_client-reference-manifest.js` each assign
 *     `globalThis.__RSC_MANIFEST["<route>"]`. Evaluate them in a sandbox object.
 *   - Each manifest carries `clientModules` (source path -> {id, name, chunks,
 *     async}), `entryCSSFiles` and `entryJSFiles`.
 *   - The shared baseline is `rootMainFiles` + `polyfillFiles` from
 *     `.next/build-manifest.json`.
 *   - A route's eager own-chunk set is the union of `chunks` over all its
 *     `clientModules`, minus the baseline.
 *
 * Two traps, both of which produce a plausible-looking but wrong table:
 *   1. Route keys carry a `/page` suffix ("/settings/profile/page").
 *   2. `clientModules[*].chunks` entries are prefixed with `/_next/` while
 *      `build-manifest.json` entries are not. Subtracting the sets without
 *      normalizing that prefix yields zero own-chunks for every route.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const root = process.cwd();
const nextDir = join(root, ".next");
const buildManifestPath = join(nextDir, "build-manifest.json");
const serverAppDir = join(nextDir, "server", "app");

function fail(message) {
  process.stderr.write(`measure-bundle: ${message}\n`);
  process.exit(1);
}

function requireBuild() {
  if (!existsSync(nextDir)) {
    fail("`.next/` is missing — run `npm run build` first.");
  }
  if (!existsSync(buildManifestPath)) {
    fail("`.next/build-manifest.json` is missing — the build is incomplete. Run `npm run build` first.");
  }
  if (!existsSync(serverAppDir)) {
    fail("`.next/server/app/` is missing — this is not a production build. Run `npm run build` first.");
  }
}

/** Collect every `page_client-reference-manifest.js` under `.next/server/app`. */
function findPageManifests(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findPageManifests(full));
    } else if (entry.name === "page_client-reference-manifest.js") {
      found.push(full);
    }
  }
  return found;
}

/**
 * Evaluate a client-reference manifest against a throwaway global and return
 * its `[route, manifest]` entries. The route key keeps its `/page` suffix here;
 * callers strip it for display only.
 */
function loadManifest(file) {
  const sandbox = {};
  const source = readFileSync(file, "utf8");
  new Function("globalThis", source)(sandbox);
  const registry = sandbox.__RSC_MANIFEST;
  if (!registry) {
    fail(
      `${relative(root, file)} did not assign __RSC_MANIFEST — the build looks stale. Run \`npm run build\` first.`,
    );
  }
  return Object.entries(registry);
}

/** `/_next/static/chunks/x.js` and `static/chunks/x.js` name the same file. */
function normalizeChunk(chunk) {
  return chunk.replace(/^\/_next\//, "");
}

/**
 * Route keys carry a `/page` suffix; `/page` itself is the root route.
 *
 * Route-group segments — `(app)`, `(public)` — are stripped too: they say which
 * provider stack a route uses and are not part of its URL, so leaving them in
 * would rename rows here and make before/after tables from either side of the
 * layout split impossible to diff.
 */
function displayRoute(key) {
  const stripped = key.replace(/\/page$/, "").replace(/\/\([^/]+\)/g, "");
  return stripped === "" ? "/" : stripped;
}

const sizeCache = new Map();

/** Raw and gzip (level 9) size of a build-relative asset path. */
function measure(assetPath) {
  const cached = sizeCache.get(assetPath);
  if (cached) return cached;

  const full = join(nextDir, assetPath);
  if (!existsSync(full)) {
    fail(
      `chunk \`${assetPath}\` is referenced by a manifest but missing from \`.next/\` — the build is stale. Run \`npm run build\` first.`,
    );
  }
  const bytes = readFileSync(full);
  const size = { raw: statSync(full).size, gzip: gzipSync(bytes, { level: 9 }).length };
  sizeCache.set(assetPath, size);
  return size;
}

function totalOf(assetPaths) {
  return [...assetPaths].reduce(
    (acc, assetPath) => {
      const { raw, gzip } = measure(assetPath);
      return { raw: acc.raw + raw, gzip: acc.gzip + gzip };
    },
    { raw: 0, gzip: 0 },
  );
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

const out = [];
const line = (text = "") => out.push(text);

function printChunkTable(assetPaths, indent = "  ") {
  const sorted = [...assetPaths].sort((a, b) => measure(b).gzip - measure(a).gzip);
  for (const assetPath of sorted) {
    const { raw, gzip } = measure(assetPath);
    line(`${indent}${assetPath.padEnd(44)} ${kb(raw).padStart(10)} raw  ${kb(gzip).padStart(10)} gzip`);
  }
}

requireBuild();

const buildManifest = JSON.parse(readFileSync(buildManifestPath, "utf8"));
const baseline = new Set(
  [...(buildManifest.rootMainFiles ?? []), ...(buildManifest.polyfillFiles ?? [])].map(normalizeChunk),
);
if (baseline.size === 0) {
  fail(
    "`build-manifest.json` has no rootMainFiles or polyfillFiles — the build is unusable. Run `npm run build` first.",
  );
}
const baselineTotal = totalOf(baseline);

const manifestFiles = findPageManifests(serverAppDir).sort();
if (manifestFiles.length === 0) {
  fail("no `page_client-reference-manifest.js` found under `.next/server/app/` — run `npm run build` first.");
}

const routes = [];
for (const file of manifestFiles) {
  for (const [key, manifest] of loadManifest(file)) {
    const ownChunks = new Set();
    for (const entry of Object.values(manifest.clientModules ?? {})) {
      for (const chunk of entry.chunks ?? []) {
        const normalized = normalizeChunk(chunk);
        if (!baseline.has(normalized)) ownChunks.add(normalized);
      }
    }

    // entryCSSFiles maps an entry source path to [{path, inlined}]; the same
    // stylesheet is listed under several entries, so dedupe by path.
    const cssChunks = new Set();
    for (const entries of Object.values(manifest.entryCSSFiles ?? {})) {
      for (const css of entries) {
        if (!css.inlined) cssChunks.add(normalizeChunk(css.path));
      }
    }

    routes.push({
      route: displayRoute(key),
      key,
      ownChunks,
      cssChunks,
      own: totalOf(ownChunks),
      css: totalOf(cssChunks),
    });
  }
}
routes.sort((a, b) => a.route.localeCompare(b.route));

const BUILD_ID = existsSync(join(nextDir, "BUILD_ID"))
  ? readFileSync(join(nextDir, "BUILD_ID"), "utf8").trim()
  : "unknown";

line("Bundle measurement — per-route eager chunks");
line(`Build ID: ${BUILD_ID}`);
line(`Routes:   ${routes.length}`);
line();
line("Shared baseline (build-manifest rootMainFiles + polyfillFiles)");
line("-".repeat(80));
printChunkTable(baseline);
line(
  `  ${`TOTAL (${baseline.size} chunks)`.padEnd(44)} ${kb(baselineTotal.raw).padStart(10)} raw  ${kb(baselineTotal.gzip).padStart(10)} gzip`,
);
line();
line();
line("Per-route eager own chunks (route chunk union minus shared baseline)");
line("=".repeat(80));

for (const entry of routes) {
  line();
  line(`${entry.route}   [manifest key: ${entry.key}]`);
  line("-".repeat(80));
  if (entry.ownChunks.size === 0) {
    line("  (no own chunks beyond the shared baseline)");
  } else {
    printChunkTable(entry.ownChunks);
  }
  line(
    `  ${`OWN JS (${entry.ownChunks.size} chunks)`.padEnd(44)} ${kb(entry.own.raw).padStart(10)} raw  ${kb(entry.own.gzip).padStart(10)} gzip`,
  );
  if (entry.cssChunks.size > 0) {
    printChunkTable(entry.cssChunks);
    line(
      `  ${`CSS (${entry.cssChunks.size} files)`.padEnd(44)} ${kb(entry.css.raw).padStart(10)} raw  ${kb(entry.css.gzip).padStart(10)} gzip`,
    );
  } else {
    line(`  ${"CSS (0 files)".padEnd(44)} ${"0.0 KB".padStart(10)} raw  ${"0.0 KB".padStart(10)} gzip`);
  }
  // The headline total is JS only (baseline + own JS). CSS is reported on its
  // own line above and deliberately kept out of this number so the figure stays
  // comparable with the JS budgets quoted in the spec.
  line(
    `  ${"TOTAL JS (baseline + own JS)".padEnd(44)} ${kb(baselineTotal.raw + entry.own.raw).padStart(10)} raw  ${kb(baselineTotal.gzip + entry.own.gzip).padStart(10)} gzip`,
  );
}

line();
line();
line("Summary (sorted by total gzip, descending)");
line("=".repeat(80));
line("TOTAL JS = shared baseline + the route's own eager JS. CSS is listed separately, not folded in.");
line("-".repeat(80));
line(
  `  ${"ROUTE".padEnd(26)} ${"CHUNKS".padStart(6)} ${"OWN JS gz".padStart(11)} ${"TOTAL JS raw".padStart(13)} ${"TOTAL JS gz".padStart(12)} ${"CSS gz".padStart(9)}`,
);
const bySize = [...routes].sort((a, b) => b.own.gzip - a.own.gzip || a.route.localeCompare(b.route));
for (const entry of bySize) {
  line(
    `  ${entry.route.padEnd(26)} ${String(entry.ownChunks.size).padStart(6)} ${kb(entry.own.gzip).padStart(11)} ${kb(baselineTotal.raw + entry.own.raw).padStart(13)} ${kb(baselineTotal.gzip + entry.own.gzip).padStart(12)} ${kb(entry.css.gzip).padStart(9)}`,
  );
}

process.stdout.write(`${out.join("\n")}\n`);
