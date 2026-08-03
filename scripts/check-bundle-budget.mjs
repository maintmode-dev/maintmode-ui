/**
 * Bundle guardrail — heavy dependencies must not sit in a route's synchronous
 * client graph.
 *
 * The defect class this catches (see docs/specs/perf-remediation.md 1.4): a heavy
 * dependency statically imported for a control that is gated behind a popover, a
 * dialog or a tab. The control is invisible until a click, but its dependency is
 * on the critical path of the first paint. Six instances were found by hand; this
 * script is what catches the seventh.
 *
 * ## The signal: `async: false`, not chunk membership
 *
 * Two designs were tried and rejected before this one (spec 1.6c and 3.7):
 *
 *   1. A rule on `clientModules` KEYS. Those keys are only `"use client"` entry
 *      boundaries, not a transitive module graph. `calendar-grid.tsx`,
 *      `combobox.tsx` and `date-time-picker.tsx` appear in ZERO route manifests
 *      even while defective, so the rule would match nothing and pass forever.
 *
 *   2. A rule on chunk-file membership. Defeated by the very defect it targets:
 *      heavy deps live in chunks SHARED across routes (day-picker spans 3 routes,
 *      cmdk lives in 4 distinct chunks). Whether a route trips would depend on
 *      Turbopack's partitioning — a coin flip producing both false negatives and
 *      false positives, and false positives train people to widen the allowlist.
 *      That is the same ratchet that made numeric KB budgets unacceptable.
 *
 * What this uses instead is the `async` flag that every `clientModules` entry
 * carries. It is a direct "is this eagerly loaded" signal and is independent of
 * how the bundler sliced chunks.
 *
 * ## Method
 *
 *   1. Baseline = `rootMainFiles` + `polyfillFiles` from `build-manifest.json`,
 *      used for the reporting columns only (never for the pass/fail decision).
 *   2. Per route, the synchronous client roots are the `clientModules` entries
 *      with `async: false`. Their keys are real source paths
 *      (`[project]/src/features/...`), which is what makes step 3 possible.
 *   3. From those roots, walk the SOURCE import graph statically, following only
 *      static top-level value imports. `import type` is erased by the compiler and
 *      `dynamic(() => import(...))` is a bundler split point, so neither is an
 *      edge. Reaching a heavy dependency this way means it is genuinely eager.
 *   4. Fail when a heavy dep is synchronously reachable from a route that is not
 *      in `allowedRoutes`.
 *
 * Chunk content-markers are computed too, but only for the REPORTING column. They
 * are never the failure signal — see rejected design 2.
 *
 * ## Mandatory self-check
 *
 * If a heavy-dep entry resolves to zero owning chunks, this script fails loudly.
 * Markers are heuristics against minified output; a major version bump would
 * silently turn this guardrail into an evergreen no-op, which is worse than
 * having no guardrail at all.
 *
 * Two manifest traps, both of which yield a plausible but wrong answer:
 *   - Route keys carry a `/page` suffix ("/settings/profile/page").
 *   - `chunks` entries are prefixed with `/_next/`; `build-manifest.json` entries
 *     are not. Normalize before comparing.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = process.cwd();
const nextDir = join(root, ".next");
const buildManifestPath = join(nextDir, "build-manifest.json");
const serverAppDir = join(nextDir, "server", "app");
const srcDir = join(root, "src");

/**
 * Routes permitted to load a heavy dependency eagerly.
 *
 * Two kinds of entry, and `permanent` is a FIELD rather than a note in prose
 * because conflating them causes a regression this script cannot see:
 *
 *   permanent: true  — the eager import is CORRECT here. Never "fix" these.
 *   permanent: false — a known-defective route awaiting its fix. Only these are
 *                      the progress tracker, and only these should reach [].
 *
 * The check is one-directional: it fails when a heavy dependency becomes
 * EAGERLY reachable, and is blind to one that is wrongly DEFERRED. So a reader
 * who takes a permanent exception for pending work and "finishes the job" gets
 * a green build and a slower route — which is why maintenance-create-view.test
 * exists as the other half of the guard.
 *
 * Adding a route here is a deliberate exception needing an owner's sign-off
 * (spec 7, "Ask first"), never a reflex to make a red build green.
 */
const allowedRoutes = {
  // Permanent exception, not a pending fix: on /maintenance/new the edit form IS
  // the page, so `MaintenanceEditMode` is imported statically on purpose (spec
  // 3.4). Deferring it would put a spinner on the critical path and delay the
  // only thing the route exists to show. The heavy deps arrive through the form
  // itself, not through a control gated behind a popover/dialog/tab, so this is
  // not the defect class this guardrail polices. The detail route, where the
  // same form sits behind a tab, is split and no longer listed here.
  "/maintenance/new": {
    permanent: true,
    reason: "create form is the page itself — static import is deliberate (spec 3.4)",
  },

  // Permanent exception, not a pending fix: this route calls notFound() when
  // NODE_ENV is production, so its bundle never reaches an operator. It is a
  // component gallery and importing the real primitives is the entire point.
  "/dev/showcase": {
    permanent: true,
    reason: "dev-only component gallery — 404s in production builds",
  },
};

/**
 * Heavy dependencies to police.
 *
 * `packages` lists the npm package names that count as "this dependency is in the
 * graph". A package is matched by exact name or as a scope prefix, so
 * `@fullcalendar/` covers every plugin.
 *
 * `marker` is a string that must appear in the minified chunk that ships the
 * dependency. It drives the reporting column and the zero-owner self-check only.
 */
const heavyDeps = [
  {
    name: "@fullcalendar/*",
    packages: ["@fullcalendar/"],
    marker: "fc-daygrid",
  },
  {
    // luxon has no direct importer in src/ — it arrives as the peer dependency of
    // @fullcalendar/luxon3, which is why the package walk (not a src-only grep)
    // is what finds it.
    name: "luxon",
    packages: ["luxon", "@fullcalendar/luxon3"],
    marker: "Invalid DateTime",
  },
  {
    name: "cmdk",
    packages: ["cmdk"],
    // cmdk stamps `cmdk-item` on every rendered item; verified present in the
    // package's own dist, not only in our shadcn wrapper's class names.
    marker: "cmdk-item",
  },
  {
    name: "react-day-picker",
    packages: ["react-day-picker"],
    marker: "rdp-",
  },
];

function fail(message) {
  process.stderr.write(`check-bundle-budget: ${message}\n`);
  process.exit(1);
}

/**
 * A missing or incomplete build must be an error, never a silent pass — a
 * guardrail that quietly does nothing is the failure mode this whole script
 * exists to prevent.
 */
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
 * Evaluate a client-reference manifest against a throwaway global and return its
 * `[route, manifest]` entries. Route keys keep their `/page` suffix here; callers
 * strip it for display.
 */
function loadManifest(file) {
  const sandbox = {};
  new Function("globalThis", readFileSync(file, "utf8"))(sandbox);
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
 * Route-group segments — `(app)`, `(public)` — are stripped as well. They exist
 * in the manifest key because the app tree groups routes by which provider stack
 * they need, but they are NOT part of any URL. Leaving them in would rename every
 * route in this report (`/(app)/maintenance/new`) and, worse, silently orphan the
 * `allowedRoutes` keys below, which are URLs — an exception that matches nothing
 * turns into a spurious failure, and the reverse mistake would turn the whole
 * guardrail into a no-op.
 */
function displayRoute(key) {
  const stripped = key.replace(/\/page$/, "").replace(/\/\([^/]+\)/g, "");
  return stripped === "" ? "/" : stripped;
}

/**
 * Manifest keys look like `[project]/src/features/x.tsx` and may carry a
 * ` <module evaluation>` suffix. Turn one into an absolute source path, or null
 * when it points outside `src/` (node_modules entries are not walk roots).
 */
function manifestKeyToSourcePath(key) {
  const cleaned = key.replace(/ <module evaluation>$/, "");
  const match = /^\[project\]\/(.*)$/.exec(cleaned);
  if (!match) return null;
  const abs = join(root, match[1]);
  return abs.startsWith(`${srcDir}/`) ? abs : null;
}

// --- source import graph -----------------------------------------------------

/**
 * Static top-level imports and re-exports only.
 *
 * Deliberately NOT matched, because neither is a synchronous edge:
 *   - `import type { X } from "y"` / `export type { X } from "y"` — erased by the
 *     compiler, contributes no runtime bytes.
 *   - `import("y")` — a dynamic import, i.e. a bundler split point. That is the
 *     documented fix for this defect class, so counting it would make every fixed
 *     route look defective.
 *
 * The clause between `import` and `from` must be allowed to span NEWLINES: a
 * multi-line named-import block is the common formatting for exactly the wide
 * re-export barrels that lead to heavy deps. An earlier version excluded `\n`
 * here and silently missed `combobox.tsx -> shadcn/command -> cmdk`, reporting a
 * defective route as clean. `;` stays excluded so the clause cannot run past the
 * end of one statement.
 */
const staticImportPattern =
  /(?:^|\n)\s*(?:import|export)\s+(?!type\s)(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/g;

const extensions = [".tsx", ".ts", ".jsx", ".js"];

/** Resolve a file path that may be missing its extension or be a directory index. */
function resolveFile(basePath) {
  if (existsSync(basePath) && !basePath.endsWith("/")) {
    const isDir = existsSync(join(basePath, "index.ts")) || existsSync(join(basePath, "index.tsx"));
    if (!isDir) return basePath;
  }
  for (const ext of extensions) {
    const candidate = `${basePath}${ext}`;
    if (existsSync(candidate)) return candidate;
  }
  for (const ext of extensions) {
    const candidate = join(basePath, `index${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Classify one import specifier as seen from `fromFile`.
 *
 * Returns either a local file to keep walking into, or the bare package name to
 * record as a reached dependency. Relative and `@/`-aliased specifiers are local;
 * everything else is a package.
 */
function classify(specifier, fromFile) {
  if (specifier.startsWith("@/")) {
    return { file: resolveFile(join(srcDir, specifier.slice(2))) };
  }
  if (specifier.startsWith(".")) {
    return { file: resolveFile(resolve(dirname(fromFile), specifier)) };
  }
  // A bare specifier is a package. Keep the scope for scoped packages so
  // `@fullcalendar/daygrid` stays distinguishable from `@fullcalendar/core`.
  const parts = specifier.split("/");
  const pkg = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  return { pkg };
}

const importCache = new Map();

/** Static top-level import specifiers of one source file. */
function importsOf(file) {
  const cached = importCache.get(file);
  if (cached) return cached;
  const content = readFileSync(file, "utf8");
  const specifiers = [...content.matchAll(staticImportPattern)].map((m) => m[1]);
  importCache.set(file, specifiers);
  return specifiers;
}

/**
 * Walk the synchronous source import graph from a set of root files and return
 * every package reachable through static value imports, mapped to the shortest
 * import path that reaches it (for the failure message).
 */
function reachablePackages(rootFiles) {
  const seen = new Set();
  const packagePaths = new Map();
  // Breadth-first so the recorded path to each package is the shortest one, which
  // makes the failure message point at the most direct importer.
  const queue = rootFiles.map((file) => ({ file, path: [file] }));

  while (queue.length > 0) {
    const { file, path } = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);

    for (const specifier of importsOf(file)) {
      const resolved = classify(specifier, file);
      if (resolved.file) {
        if (!seen.has(resolved.file)) {
          queue.push({ file: resolved.file, path: [...path, resolved.file] });
        }
      } else if (resolved.pkg && !packagePaths.has(resolved.pkg)) {
        packagePaths.set(resolved.pkg, [...path, resolved.pkg]);
      }
    }
  }
  return packagePaths;
}

/** Does a reached package name belong to this heavy dependency? */
function matchesDep(pkg, dep) {
  return dep.packages.some((p) => (p.endsWith("/") ? pkg.startsWith(p) : pkg === p));
}

// --- chunk markers (reporting + self-check only) ------------------------------

/**
 * Find, for each heavy dep, the built chunks whose contents carry its marker.
 *
 * This drives the reporting column and the self-check below. It is deliberately
 * NOT part of the pass/fail decision: chunk membership is a function of the
 * bundler's partitioning, which is exactly what rejected design 2 got wrong.
 */
function findMarkerOwners() {
  const chunkDir = join(nextDir, "static", "chunks");
  if (!existsSync(chunkDir)) {
    fail("`.next/static/chunks/` is missing — the build is incomplete. Run `npm run build` first.");
  }

  const files = [];
  const collect = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) collect(full);
      else if (entry.name.endsWith(".js")) files.push(full);
    }
  };
  collect(chunkDir);

  const owners = new Map(heavyDeps.map((dep) => [dep.name, []]));
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const dep of heavyDeps) {
      if (content.includes(dep.marker)) {
        owners.get(dep.name).push(relative(nextDir, file));
      }
    }
  }
  return owners;
}

// --- run ---------------------------------------------------------------------

requireBuild();

const buildManifest = JSON.parse(readFileSync(buildManifestPath, "utf8"));
const baseline = new Set(
  [...(buildManifest.rootMainFiles ?? []), ...(buildManifest.polyfillFiles ?? [])].map(normalizeChunk),
);
if (baseline.size === 0) {
  fail("`build-manifest.json` has no rootMainFiles or polyfillFiles — the build is unusable.");
}

const manifestFiles = findPageManifests(serverAppDir).sort();
if (manifestFiles.length === 0) {
  fail("no `page_client-reference-manifest.js` found under `.next/server/app/` — run `npm run build` first.");
}

// Self-check first: if the markers have rotted, every result below is worthless,
// so say so before reporting anything that might look reassuring.
const markerOwners = findMarkerOwners();
const rotted = heavyDeps.filter((dep) => markerOwners.get(dep.name).length === 0);
if (rotted.length > 0) {
  process.stderr.write("check-bundle-budget: marker no longer matches — update the pattern.\n\n");
  for (const dep of rotted) {
    process.stderr.write(`  ${dep.name}: marker ${JSON.stringify(dep.marker)} matched ZERO built chunks.\n`);
  }
  process.stderr.write(
    "\nMarkers are heuristics against minified output. A major version bump can change them,\n" +
      "which would silently turn this guardrail into an evergreen no-op — worse than no guardrail\n" +
      "at all. Re-derive the marker from the new output and update `heavyDeps` in this script.\n",
  );
  process.exit(1);
}

const routes = [];
for (const file of manifestFiles) {
  for (const [key, manifest] of loadManifest(file)) {
    // The synchronous client graph: entries the bundler marked as eagerly loaded.
    const syncRoots = [];
    for (const [moduleKey, entry] of Object.entries(manifest.clientModules ?? {})) {
      if (entry.async === true) continue;
      const sourcePath = manifestKeyToSourcePath(moduleKey);
      if (sourcePath && existsSync(sourcePath)) syncRoots.push(sourcePath);
    }

    const packagePaths = reachablePackages([...new Set(syncRoots)]);
    const reached = heavyDeps
      .map((dep) => {
        const hit = [...packagePaths.keys()].find((pkg) => matchesDep(pkg, dep));
        return hit ? { dep, pkg: hit, path: packagePaths.get(hit) } : null;
      })
      .filter(Boolean);

    routes.push({ route: displayRoute(key), syncRoots, reached });
  }
}
routes.sort((a, b) => a.route.localeCompare(b.route));

const violations = [];
const allowed = [];
for (const entry of routes) {
  if (entry.reached.length === 0) continue;
  if (Object.hasOwn(allowedRoutes, entry.route)) allowed.push(entry);
  else violations.push(entry);
}

const out = [];
const line = (text = "") => out.push(text);

line("Bundle guardrail — heavy dependencies in the synchronous client graph");
line("=".repeat(78));
line(`Routes checked: ${routes.length}   Baseline chunks: ${baseline.size}`);
line();
line("Heavy dependencies and the chunks that carry them (reporting only):");
for (const dep of heavyDeps) {
  const owners = markerOwners.get(dep.name);
  line(
    `  ${dep.name.padEnd(20)} ${String(owners.length).padStart(2)} chunk(s)  marker ${JSON.stringify(dep.marker)}`,
  );
}
line();

const clean = routes.filter((entry) => entry.reached.length === 0);
line(`Clean routes (${clean.length}): no heavy dependency reachable synchronously.`);
for (const entry of clean) line(`  ok    ${entry.route}`);

const describeAllowed = (entry) => {
  const deps = entry.reached.map((r) => r.dep.name).join(", ");
  line(`  allow ${entry.route.padEnd(24)} ${deps}`);
  line(`        reason: ${allowedRoutes[entry.route].reason}`);
};

const permanentAllowed = allowed.filter((e) => allowedRoutes[e.route].permanent);
const pendingAllowed = allowed.filter((e) => !allowedRoutes[e.route].permanent);

if (permanentAllowed.length > 0) {
  line();
  line(`Permanent exceptions (${permanentAllowed.length}) — the eager import is correct here:`);
  permanentAllowed.forEach(describeAllowed);
  line();
  // Spelled out because the natural reading of any allowlist is "work not done
  // yet", and acting on that reading here introduces a regression this check
  // cannot detect: it fails on eager reachability, never on a wrongly deferred one.
  line("  Do NOT 'fix' these — deferring them is the regression, not the fix.");
}

if (pendingAllowed.length > 0) {
  line();
  line(`Pending fixes (${pendingAllowed.length}) — known-defective routes awaiting their fix:`);
  pendingAllowed.forEach(describeAllowed);
  line();
  line("  This list is the progress tracker; it should shrink to [] as fixes land.");
}

if (violations.length > 0) {
  line();
  line("FAILURES".padEnd(78, " "));
  line("-".repeat(78));
  for (const entry of violations) {
    line(`  FAIL  ${entry.route}`);
    for (const hit of entry.reached) {
      line(`        ${hit.dep.name} is reachable through a static import chain:`);
      for (const step of hit.path) {
        const label = step.startsWith("/") ? relative(root, step) : `[package] ${step}`;
        line(`          -> ${label}`);
      }
    }
    line();
  }
  line(
    "A heavy dependency is on this route's critical path even though the control that\n" +
      "needs it is gated behind a popover, dialog or tab. Load it with `dynamic()` and\n" +
      "`ssr: false` (see src/features/approvals/approvals-page.tsx for the in-repo\n" +
      "reference), or — if this is a deliberate exception — add the route to\n" +
      "`allowedRoutes` in scripts/check-bundle-budget.mjs with a reason.",
  );
  process.stdout.write(`${out.join("\n")}\n`);
  process.exit(1);
}

line();
line("Bundle guardrail passed.");
process.stdout.write(`${out.join("\n")}\n`);
