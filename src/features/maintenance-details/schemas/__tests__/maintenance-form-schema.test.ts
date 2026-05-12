import { describe, expect, it } from "vitest";

import {
  makeDefaultFormValues,
  makeEmptyStep,
  maintenanceFormSchema,
} from "@/features/maintenance-details/schemas/maintenance-form-schema";

function validValues() {
  return {
    title: "DB migration",
    description: "Apply schema change v42",
    planned_start_at: "2026-06-01T10:00:00.000Z",
    impact: "none" as const,
    scope: "global" as const,
    resource_ids: [],
    steps: [makeEmptyStep(1)],
  };
}

describe("maintenanceFormSchema", () => {
  it("accepts a valid global maintenance", () => {
    const result = maintenanceFormSchema.safeParse({
      ...validValues(),
      steps: [
        { order: 1, description: "do thing", rollback_description: "undo thing", duration_minutes: 30 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects title shorter than 3 chars", () => {
    const result = maintenanceFormSchema.safeParse({ ...validValues(), title: "ab" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "title")).toBe(true);
    }
  });

  it("rejects description shorter than 10 chars", () => {
    const result = maintenanceFormSchema.safeParse({ ...validValues(), description: "too short" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "description")).toBe(true);
    }
  });

  it("rejects invalid planned_start_at", () => {
    const result = maintenanceFormSchema.safeParse({
      ...validValues(),
      planned_start_at: "not a date",
    });
    expect(result.success).toBe(false);
  });

  it("rejects scope=resource with empty resource_ids", () => {
    const result = maintenanceFormSchema.safeParse({
      ...validValues(),
      scope: "resource" as const,
      resource_ids: [],
      steps: [
        { order: 1, description: "do thing", rollback_description: "undo thing", duration_minutes: 30 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "resource_ids")).toBe(true);
    }
  });

  it("accepts scope=resource with at least one id", () => {
    const result = maintenanceFormSchema.safeParse({
      ...validValues(),
      scope: "resource" as const,
      resource_ids: ["res-1"],
      steps: [
        { order: 1, description: "do thing", rollback_description: "undo thing", duration_minutes: 30 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty steps", () => {
    const result = maintenanceFormSchema.safeParse({ ...validValues(), steps: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "steps")).toBe(true);
    }
  });

  it("rejects step duration_minutes of 0", () => {
    const result = maintenanceFormSchema.safeParse({
      ...validValues(),
      steps: [
        { order: 1, description: "do", rollback_description: "undo", duration_minutes: 0 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (i) => i.path[0] === "steps" && i.path[1] === 0 && i.path[2] === "duration_minutes",
        ),
      ).toBe(true);
    }
  });

  it("rejects duplicate step order", () => {
    const result = maintenanceFormSchema.safeParse({
      ...validValues(),
      steps: [
        { order: 1, description: "a", rollback_description: "x", duration_minutes: 10 },
        { order: 1, description: "b", rollback_description: "y", duration_minutes: 20 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("order"))).toBe(true);
    }
  });

  it("rejects empty step description and rollback", () => {
    const result = maintenanceFormSchema.safeParse({
      ...validValues(),
      steps: [
        { order: 1, description: "", rollback_description: "", duration_minutes: 30 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("steps.0.description");
      expect(paths).toContain("steps.0.rollback_description");
    }
  });
});

describe("makeDefaultFormValues", () => {
  it("returns one empty step when no defaults are provided", () => {
    const defaults = makeDefaultFormValues();
    expect(defaults.steps).toHaveLength(1);
    expect(defaults.steps[0].order).toBe(1);
    expect(defaults.scope).toBe("global");
  });

  it("merges provided partial defaults", () => {
    const defaults = makeDefaultFormValues({ title: "Hello", scope: "resource" });
    expect(defaults.title).toBe("Hello");
    expect(defaults.scope).toBe("resource");
  });
});
