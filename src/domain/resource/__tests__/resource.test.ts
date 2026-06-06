import { describe, expect, it } from "vitest";

import { isResourceArchived } from "@/domain/resource/resource";

describe("isResourceArchived", () => {
  it("is true for the archived status", () => {
    expect(isResourceArchived({ status: "archived" })).toBe(true);
  });

  it("is false for active / other / empty statuses", () => {
    expect(isResourceArchived({ status: "active" })).toBe(false);
    expect(isResourceArchived({ status: "draft" })).toBe(false);
    expect(isResourceArchived({ status: "" })).toBe(false);
  });

  it("tolerates case and surrounding whitespace", () => {
    expect(isResourceArchived({ status: "Archived" })).toBe(true);
    expect(isResourceArchived({ status: " archived " })).toBe(true);
    expect(isResourceArchived({ status: "ARCHIVED" })).toBe(true);
  });
});
