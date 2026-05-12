"use client";

import type { FieldPath, FieldValues, UseFormSetError } from "react-hook-form";

import { BffError } from "@/features/_shared/api/bff-error";

const KNOWN_TOP_LEVEL_FIELDS = new Set([
  "title",
  "description",
  "planned_start_at",
  "impact",
  "scope",
  "resource_ids",
  "steps",
]);

/**
 * Maps BffError.fieldErrors[] onto react-hook-form via `setError`.
 * Returns `true` if any error mapped to a recognized form field, `false`
 * otherwise (caller should surface a top-level alert).
 *
 * Backend dotted paths like `steps.0.description` are passed through verbatim
 * because RHF accepts the same dotted syntax for nested arrays.
 */
export function mapFieldErrors<TValues extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<TValues>,
): boolean {
  if (!(error instanceof BffError) || !error.fieldErrors || error.fieldErrors.length === 0) {
    return false;
  }

  let mapped = false;
  for (const fieldError of error.fieldErrors) {
    const root = fieldError.field.split(".")[0];
    if (!KNOWN_TOP_LEVEL_FIELDS.has(root)) {
      continue;
    }
    setError(fieldError.field as FieldPath<TValues>, {
      type: "server",
      message: fieldError.message,
    });
    mapped = true;
  }

  return mapped;
}
