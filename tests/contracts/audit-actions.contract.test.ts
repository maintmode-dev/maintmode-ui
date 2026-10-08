import { describe, expect, it } from "vitest";

import { readWireFixture } from "./_harness";

import { AUDIT_ACTIONS, isKnownAuditAction } from "@/domain/audit/audit-log";
import { AUDIT_CATEGORIES, auditCategoryActions } from "@/domain/audit/audit-presentation";

/**
 * Drift guard — `AUDIT_ACTIONS` against the enum the backend publishes. RUK-297.
 *
 * The UI's action list is hand-maintained (each member needs a label, a colour
 * and a chip, which are UI decisions), and it fell five actions behind the
 * backend: `auth_method.toggled`, `password.changed`, `password.reset`,
 * `provider.linked`, `user.tags_changed`. Nothing noticed, because the route
 * dropped unknown rows on a 200 and an absent row has no symptom. The rows now
 * render as neutral "unknown" rows instead — but an unknown row has no label,
 * no colour and no chip, so falling behind still costs the operator. This is
 * what makes it fail CI rather than wait to be spotted.
 *
 * The comparison side is `audit-action-enum.json`: the backend's
 * `entity.AuditAction` schema, vendored verbatim from its OpenAPI spec by
 * `npm run fixtures:audit-actions` (see that script for why it is vendored
 * rather than captured). Refresh it, then run this file.
 */

const vendored = readWireFixture<{ "entity.AuditAction"?: { enum?: unknown } }>("audit-action-enum.json");
const published = vendored["entity.AuditAction"]?.enum;

describe("AUDIT_ACTIONS matches the backend's published entity.AuditAction enum", () => {
  it("reads a real enum from the vendored schema", () => {
    // Preconditions, so an empty or renamed schema cannot pass the comparisons
    // below vacuously. The anchors are literals, not read from the file.
    expect(Array.isArray(published)).toBe(true);
    expect(published).toEqual(expect.arrayContaining(["login.success", "maintenance.created"]));
  });

  it("models every action the backend can write", () => {
    // The failure names the actions to add — label, colour and category in
    // src/domain/audit/audit-presentation.ts, not just the enum entry.
    const known = new Set<string>(AUDIT_ACTIONS);
    const missing = (published as string[]).filter((action) => !known.has(action));

    expect(`actions the backend writes and the UI does not model: ${missing.join(", ") || "none"}`).toBe(
      "actions the backend writes and the UI does not model: none",
    );
  });

  it("models no action the backend no longer writes", () => {
    // The other direction: a member kept after the backend dropped it is a chip
    // filtering on a value the backend's read filter (`IsValid()`) rejects.
    const backend = new Set(published as string[]);
    const stale = AUDIT_ACTIONS.filter((action) => !backend.has(action));

    expect(`actions the UI models and the backend does not publish: ${stale.join(", ") || "none"}`).toBe(
      "actions the UI models and the backend does not publish: none",
    );
  });
});

describe("every published action is reachable from the filter bar", () => {
  it("is requested by exactly one chip", () => {
    // A modelled action under no chip is a row the backend counts in a facet
    // but no chip ever asks the server for; under two chips, it is counted once
    // and shown twice. No exception list: since the v0.3.1 regroup the backend
    // puts every action in exactly one category, and so must the chips.
    const chips = AUDIT_CATEGORIES.map((c) => c.id).filter((id) => id !== "all");
    const unplaced = (published as string[]).filter((action) => {
      // An unmodelled action is already named by the test above.
      if (!isKnownAuditAction(action)) return false;
      return chips.filter((chip) => auditCategoryActions(chip).includes(action)).length !== 1;
    });

    expect(`published actions under no chip (or several): ${unplaced.join(", ") || "none"}`).toBe(
      "published actions under no chip (or several): none",
    );
  });
});
