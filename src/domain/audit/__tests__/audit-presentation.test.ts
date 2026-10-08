import { describe, expect, it } from "vitest";

import { AUDIT_ACTIONS } from "@/domain/audit/audit-log";
import {
  AUDIT_CATEGORIES,
  auditActionDotToken,
  auditActionInCategory,
  auditActionLabel,
  auditCategoryActions,
  isSignInShaped,
  UNKNOWN_ACTION_TOKEN,
} from "@/domain/audit/audit-presentation";

// Non-`all` categories — `all` matches everything, so it's excluded from the
// partition checks below.
const REAL_CATEGORIES = AUDIT_CATEGORIES.map((c) => c.id).filter((c) => c !== "all");

describe("auditActionLabel / auditActionDotToken", () => {
  // Every modelled action has its own meta row: a humanised label, not the raw
  // wire value it would fall back to if the row were missing.
  it.each(AUDIT_ACTIONS)("returns a humanised label and a CSS var token for %s", (action) => {
    const label = auditActionLabel(action);
    expect(label.length).toBeGreaterThan(0);
    expect(label).not.toBe(action);
    expect(auditActionDotToken(action)).toMatch(/^--/);
  });

  it("labels the five RUK-297 actions as approved", () => {
    expect(auditActionLabel("auth_method.toggled")).toBe("Sign-in method toggled");
    expect(auditActionLabel("password.changed")).toBe("Password changed");
    expect(auditActionLabel("password.reset")).toBe("Password reset");
    expect(auditActionLabel("provider.linked")).toBe("Provider linked");
    expect(auditActionLabel("user.tags_changed")).toBe("User tags changed");
  });

  it("labels the invitation and catalog actions", () => {
    expect(auditActionLabel("invitation.created")).toBe("Invitation created");
    expect(auditActionLabel("invitation.revoked")).toBe("Invitation revoked");
    expect(auditActionLabel("resource.archived")).toBe("Resource archived");
    expect(auditActionLabel("notify_channel.unarchived")).toBe("Channel unarchived");
  });

  it("renders an action the UI does not model with its raw value and the neutral dot, without throwing", () => {
    expect(auditActionLabel("something.new")).toBe("something.new");
    expect(auditActionDotToken("something.new")).toBe(UNKNOWN_ACTION_TOKEN);
  });
});

describe("category partition", () => {
  // The actions are hand-assigned across 4 category sets; the type system
  // does NOT catch an action that's missing from every set (it just becomes
  // unfilterable by any chip). Assert exactly-one-category coverage — with no
  // exception list: since the v0.3.1 regroup every modelled action has a chip.
  it.each(AUDIT_ACTIONS)("places %s in exactly one non-`all` category", (action) => {
    const hits = REAL_CATEGORIES.filter((cat) => auditActionInCategory(action, cat));
    expect(hits).toHaveLength(1);
  });

  it("matches every action under `all`", () => {
    for (const action of AUDIT_ACTIONS) {
      expect(auditActionInCategory(action, "all")).toBe(true);
    }
  });

  it("puts an action the UI does not model under `all` and under no chip", () => {
    // The chips request a CSV of KNOWN actions, so the server can never return
    // an unknown one under a chip; the client must not claim otherwise.
    expect(auditActionInCategory("something.new", "all")).toBe(true);
    for (const cat of REAL_CATEGORIES) {
      expect(auditActionInCategory("something.new", cat)).toBe(false);
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

  // Literals transcribed from the backend's category map
  // (`auditActionCategories`, internal/entity/audit.go), which computes the
  // facet counts. A chip requesting fewer actions than its facet counts shows a
  // number its table never reaches — the RUK-297 symptom.
  it("offers exactly the five approved chips, in order, with their labels", () => {
    expect(AUDIT_CATEGORIES).toEqual([
      { id: "all", label: "All" },
      { id: "sign_in", label: "Sign-ins" },
      { id: "users", label: "Users" },
      { id: "settings", label: "Settings" },
      { id: "maintenance", label: "Maintenance" },
    ]);
  });

  it("maps `sign_in` to the three session events", () => {
    expect(new Set(auditCategoryActions("sign_in"))).toEqual(
      new Set(["login.success", "login.failed", "logout.success"]),
    );
  });

  it("maps `users` to the account-change and invitation events", () => {
    expect(new Set(auditCategoryActions("users"))).toEqual(
      new Set([
        "roles.changed",
        "user.tags_changed",
        "user.blocked",
        "user.unblocked",
        "password.changed",
        "password.reset",
        "provider.linked",
        "invitation.created",
        "invitation.revoked",
      ]),
    );
  });

  it("maps `settings` to the sign-in method toggle, the integration lifecycle and the catalogs", () => {
    expect(new Set(auditCategoryActions("settings"))).toEqual(
      new Set([
        "auth_method.toggled",
        "integration.created",
        "integration.updated",
        "integration.deleted",
        "resource.created",
        "resource.updated",
        "resource.archived",
        "resource.unarchived",
        "notify_channel.created",
        "notify_channel.updated",
        "notify_channel.archived",
        "notify_channel.unarchived",
      ]),
    );
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

describe("isSignInShaped", () => {
  it("covers logins and the credential events written with a login's payload", () => {
    for (const action of [
      "login.success",
      "login.failed",
      "password.changed",
      "password.reset",
      "provider.linked",
    ]) {
      expect(isSignInShaped(action)).toBe(true);
    }
    expect(isSignInShaped("logout.success")).toBe(false);
    expect(isSignInShaped("auth_method.toggled")).toBe(false);
    expect(isSignInShaped("something.new")).toBe(false);
  });
});
