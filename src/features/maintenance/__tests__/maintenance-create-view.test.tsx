// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `/maintenance/new` (T10) — guards the split that made the create and detail
 * routes stop shipping byte-identical payloads.
 *
 * These assert on the module graph, not on rendered output, and that is
 * deliberate: the invariant here is *how* the form is imported, which no render
 * can observe. `next/dynamic` also never resolves under this vitest setup, so a
 * rendering test would pass whichever way the import is written — the vacuous
 * shape this repo has been bitten by repeatedly.
 *
 * The bundle guardrail (`scripts/check-bundle-budget.mjs`) does not cover this
 * direction either. It fails when a heavy dependency becomes *eagerly*
 * reachable; a form that is wrongly deferred is invisible to it.
 */

const SRC = join(process.cwd(), "src/features/maintenance");
const createView = readFileSync(join(SRC, "maintenance-create-view.tsx"), "utf8");
const detailsPage = readFileSync(join(SRC, "maintenance-details-page.tsx"), "utf8");

describe("MaintenanceCreateView module graph (perf T10)", () => {
  it("imports the edit form statically — on /maintenance/new the form IS the page", () => {
    // A top-level `import { MaintenanceEditMode } from "./maintenance-edit-mode"`.
    expect(createView).toMatch(
      /^import\s*\{[^}]*MaintenanceEditMode[^}]*\}\s*from\s*"\.\/maintenance-edit-mode";/m,
    );
    // Deferring it here would only put a spinner on the critical path: there is
    // nothing else on the route to look at while it loads.
    expect(createView).not.toMatch(/dynamic\(\s*\(\)\s*=>\s*import\(\s*"\.\/maintenance-edit-mode"/);
  });

  it("does not reach the detail-only subtree that made the two routes identical", () => {
    // These are what `/maintenance/new` shed when the runtime `if (creating)`
    // branch was replaced by a route-entry split. Re-importing any of them here
    // silently re-merges the two payloads.
    for (const detailOnly of [
      "maintenance-quick-sheet",
      "cancel-maintenance-dialog",
      "step-row",
      "conflict-card",
    ]) {
      expect(createView).not.toContain(detailOnly);
    }
  });

  it("keeps the detail page loading the same form lazily — the asymmetry is the point", () => {
    // The mirror of the first assertion. If someone "unifies" the two files by
    // making this one static too, the 30 KB the detail route shed comes back.
    expect(detailsPage).toMatch(/dynamic\(/);
    expect(detailsPage).toMatch(/import\(\s*"\.\/maintenance-edit-mode"/);
    expect(detailsPage).not.toMatch(
      /^import\s*\{[^}]*MaintenanceEditMode[^}]*\}\s*from\s*"\.\/maintenance-edit-mode";/m,
    );
  });

  it("no longer accepts a `creating` prop on the detail page", () => {
    // The prop was the runtime branch that defeated code splitting: one module
    // served both routes, so Turbopack traced both subtrees from a single entry.
    // Its absence is what forces the two routes through separate entries.
    //
    // Asserted against the props *interface* rather than the function signature,
    // because the signature destructures a named type — an earlier version of
    // this test matched the inline shape, which does not exist here, and so
    // passed no matter what the file contained.
    const props = detailsPage.match(/interface MaintenanceDetailsPageProps\s*\{[^}]*\}/s)?.[0];
    expect(props, "MaintenanceDetailsPageProps not found — did the props type get renamed?").toBeDefined();
    expect(props).not.toContain("creating");
  });
});
