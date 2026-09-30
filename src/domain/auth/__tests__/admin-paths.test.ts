import { describe, expect, it } from "vitest";

import { isAdminPath } from "../admin-paths";

describe("isAdminPath", () => {
  it.each([
    "/admin/users",
    "/admin/audit-log",
    "/settings/workspace",
    "/settings/workspace/authentication",
    "/settings/workspace/integrations",
  ])("gates %s", (path) => {
    expect(isAdminPath(path)).toBe(true);
  });

  it.each([
    // Every user's half of Settings — gating it would lock people out of
    // their own profile.
    "/settings",
    "/settings/profile",
    "/",
    "/approvals",
    // Exact on the segment: a look-alike prefix is not the admin area.
    "/settings/workspaces",
    "/administrator",
  ])("leaves %s to the ordinary session check", (path) => {
    expect(isAdminPath(path)).toBe(false);
  });
});
