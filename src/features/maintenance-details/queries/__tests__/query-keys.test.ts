import { describe, expect, it } from "vitest";

import { maintenanceDetailsQueryKeys } from "@/features/maintenance-details/queries/query-keys";

describe("maintenanceDetailsQueryKeys", () => {
  it("hangs every detail key off a single root so invalidating all clears the cache", () => {
    const detailKey = maintenanceDetailsQueryKeys.detail("m1");
    expect(detailKey[0]).toBe(maintenanceDetailsQueryKeys.all[0]);
  });

  it("produces stable keys for the same id", () => {
    expect(maintenanceDetailsQueryKeys.detail("m1")).toEqual(maintenanceDetailsQueryKeys.detail("m1"));
  });

  it("produces distinct keys for different ids", () => {
    expect(maintenanceDetailsQueryKeys.detail("m1")).not.toEqual(maintenanceDetailsQueryKeys.detail("m2"));
  });
});
