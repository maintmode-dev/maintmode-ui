import { describe, expect, it } from "vitest";

import { kindMeta } from "../integration-kinds";

/**
 * This file must NOT import `../auth-kinds`.
 *
 * The unregistered state is the PRODUCTION state: the gated section is the only
 * thing that imports the auth metadata, and it is dropped from a production
 * build. Every other test in this feature imports `auth-kinds` (directly or via
 * the dialog), so without this file the path that actually ships is never
 * exercised.
 */
describe("kindMeta without the auth metadata registered", () => {
  it("resolves the notification kinds", () => {
    expect(kindMeta("slack")?.label).toBe("Slack");
    expect(kindMeta("email")?.label).toBe("Email");
  });

  it("returns null for an auth kind, rather than throwing", () => {
    expect(kindMeta("oidc")).toBeNull();
    expect(kindMeta("github_oauth")).toBeNull();
  });

  it("returns null for an unknown kind", () => {
    expect(kindMeta("carrier_pigeon")).toBeNull();
  });
});
