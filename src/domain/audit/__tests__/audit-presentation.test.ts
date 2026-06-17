import { describe, expect, it } from "vitest";

import { AUDIT_ACTIONS } from "@/domain/audit/audit-log";
import {
  AUDIT_CATEGORIES,
  auditActionDotToken,
  auditActionInCategory,
  auditActionLabel,
  auditCategoryActions,
} from "@/domain/audit/audit-presentation";

// Non-`all` categories — `all` matches everything, so it's excluded from the
// partition checks below.
const REAL_CATEGORIES = AUDIT_CATEGORIES.map((c) => c.id).filter((c) => c !== "all");

describe("auditActionLabel / auditActionDotToken", () => {
  // `ACTION_META[action]` has no fallback, so a missing key throws at runtime.
  // TypeScript enforces exhaustiveness at build time; this guards it at runtime
  // too (e.g. if a typecheck regression slips through CI).
  it.each(AUDIT_ACTIONS)("returns a non-empty label and a CSS var token for %s", (action) => {
    const label = auditActionLabel(action);
    expect(label).toBeTruthy();
    expect(label.length).toBeGreaterThan(0);
    expect(auditActionDotToken(action)).toMatch(/^--/);
  });
});

describe("category partition", () => {
  // The 15 actions are hand-assigned across 4 category sets; the type system
  // does NOT catch an action that's missing from every set (it just becomes
  // unfilterable by any chip). Assert exactly-one-category coverage.
  it.each(AUDIT_ACTIONS)("places %s in exactly one non-`all` category", (action) => {
    const hits = REAL_CATEGORIES.filter((cat) => auditActionInCategory(action, cat));
    expect(hits).toHaveLength(1);
  });

  it("matches every action under `all`", () => {
    for (const action of AUDIT_ACTIONS) {
      expect(auditActionInCategory(action, "all")).toBe(true);
    }
  });
});

describe("auditCategoryActions", () => {
  it("returns an empty list for `all` (no filter)", () => {
    expect(auditCategoryActions("all")).toEqual([]);
  });

  it("round-trips: every returned action belongs to its category", () => {
    for (const cat of REAL_CATEGORIES) {
      const actions = auditCategoryActions(cat);
      expect(actions.length).toBeGreaterThan(0);
      for (const action of actions) {
        expect(auditActionInCategory(action, cat)).toBe(true);
      }
    }
  });

  it("maps `maintenance` to the nine maintenance lifecycle actions", () => {
    expect(new Set(auditCategoryActions("maintenance"))).toEqual(
      new Set([
        "maintenance.created",
        "maintenance.updated",
        "maintenance.approved",
        "maintenance.started",
        "maintenance.completed",
        "maintenance.canceled",
        "maintenance_step.started",
        "maintenance_step.completed",
        "maintenance_step.canceled",
      ]),
    );
  });
});
