import { describe, expect, it } from "vitest";

import { hasRole, isAdmin } from "@/domain/auth/permissions";

describe("permissions", () => {
  it("returns false for undefined or empty role arrays", () => {
    expect(isAdmin(undefined)).toBe(false);
    expect(isAdmin([])).toBe(false);
    expect(hasRole(undefined, "admin")).toBe(false);
    expect(hasRole([], "editor")).toBe(false);
  });

  it("returns true when the role is present", () => {
    expect(isAdmin(["admin", "editor"])).toBe(true);
    expect(hasRole(["reviewer"], "reviewer")).toBe(true);
  });

  it("returns false when the role is absent", () => {
    expect(isAdmin(["editor", "reviewer"])).toBe(false);
    expect(hasRole(["guest"], "admin")).toBe(false);
  });
});
