import { describe, expect, it } from "vitest";

import { canWrite, DEV_LOGIN_ROLES, hasRole, isAdmin, isRole } from "@/domain/auth/permissions";

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

describe("canWrite", () => {
  it("returns false for undefined, empty, or read-only role sets", () => {
    expect(canWrite(undefined)).toBe(false);
    expect(canWrite([])).toBe(false);
    expect(canWrite(["guest"])).toBe(false);
  });

  it("returns true for any write-capable role, including guest-union sets", () => {
    expect(canWrite(["guest", "editor"])).toBe(true);
    expect(canWrite(["editor"])).toBe(true);
    expect(canWrite(["guest", "reviewer"])).toBe(true);
    expect(canWrite(["reviewer"])).toBe(true);
    expect(canWrite(["guest", "admin"])).toBe(true);
    expect(canWrite(["admin"])).toBe(true);
  });

  it("is a positive check — never derives from guest presence or roles.length", () => {
    // A lone unknown role has length 1 but grants no write right.
    expect(canWrite(["someone-else"])).toBe(false);
    // Multiple read-only roles still cannot write.
    expect(canWrite(["guest", "guest"])).toBe(false);
  });
});

describe("isRole / DEV_LOGIN_ROLES", () => {
  it("accepts exactly the four assignable roles", () => {
    expect(DEV_LOGIN_ROLES).toEqual(["admin", "reviewer", "editor", "guest"]);
    for (const role of DEV_LOGIN_ROLES) {
      expect(isRole(role)).toBe(true);
    }
  });

  it("rejects unknown or malformed roles", () => {
    // These would be rejected by the backend with HTTP 400 — the FE must not
    // offer or forward them.
    expect(isRole("system admin")).toBe(false);
    expect(isRole("Admin")).toBe(false); // case-sensitive: wire values are lowercase
    expect(isRole("")).toBe(false);
    expect(isRole("superuser")).toBe(false);
  });
});
