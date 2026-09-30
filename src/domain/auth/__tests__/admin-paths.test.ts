import { describe, expect, it } from "vitest";

import { isAdminPath } from "../admin-paths";

describe("isAdminPath", () => {
  it.each(["/admin", "/admin/users", "/admin/authentication", "/admin/integrations", "/admin/audit-log"])(
    "gates %s",
    (path) => {
      expect(isAdminPath(path)).toBe(true);
    },
  );

  it.each([
    // Every user's own settings — gating them would lock people out of their
    // profile.
    "/settings",
    "/settings/profile",
    "/",
    "/approvals",
    // Exact on the segment: a look-alike prefix is not the admin area.
    "/administrator",
  ])("leaves %s to the ordinary session check", (path) => {
    expect(isAdminPath(path)).toBe(false);
  });
});
