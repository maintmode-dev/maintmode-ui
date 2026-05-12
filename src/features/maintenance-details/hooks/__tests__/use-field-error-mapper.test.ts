import { describe, expect, it, vi } from "vitest";

import { BffError } from "@/features/_shared/api/bff-error";
import { mapFieldErrors } from "@/features/maintenance-details/hooks/use-field-error-mapper";

describe("mapFieldErrors", () => {
  it("returns false for non-BffError input", () => {
    const setError = vi.fn();
    expect(mapFieldErrors(new Error("boom"), setError)).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });

  it("returns false when BffError has no fieldErrors", () => {
    const err = new BffError(500, { error: "boom", code: "BOOM" });
    const setError = vi.fn();
    expect(mapFieldErrors(err, setError)).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });

  it("maps top-level field errors", () => {
    const err = new BffError(400, {
      error: "validation",
      code: "VALIDATION_ERROR",
      fieldErrors: [{ field: "title", message: "is required" }],
    });
    const setError = vi.fn();
    expect(mapFieldErrors(err, setError)).toBe(true);
    expect(setError).toHaveBeenCalledWith("title", { type: "server", message: "is required" });
  });

  it("maps nested step paths verbatim", () => {
    const err = new BffError(400, {
      error: "validation",
      code: "VALIDATION_ERROR",
      fieldErrors: [{ field: "steps.1.duration_minutes", message: "must be positive" }],
    });
    const setError = vi.fn();
    expect(mapFieldErrors(err, setError)).toBe(true);
    expect(setError).toHaveBeenCalledWith("steps.1.duration_minutes", {
      type: "server",
      message: "must be positive",
    });
  });

  it("ignores errors whose root field is unknown", () => {
    const err = new BffError(400, {
      error: "validation",
      code: "VALIDATION_ERROR",
      fieldErrors: [{ field: "unrecognized", message: "huh" }],
    });
    const setError = vi.fn();
    expect(mapFieldErrors(err, setError)).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });
});
