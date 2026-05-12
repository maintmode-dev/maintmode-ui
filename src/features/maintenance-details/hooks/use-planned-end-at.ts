"use client";

import { useMemo } from "react";
import { useWatch, type Control } from "react-hook-form";

import type { MaintenanceFormValues } from "@/features/maintenance-details/schemas/maintenance-form-schema";

export type UsePlannedEndAtResult = {
  plannedEndAt: Date | null;
  totalMinutes: number;
};

/**
 * Derives `planned_end_at` from `planned_start_at` + sum(step.duration_minutes).
 * Returns `plannedEndAt = null` when the start is unparseable.
 */
export function usePlannedEndAt(control: Control<MaintenanceFormValues>): UsePlannedEndAtResult {
  const plannedStartAt = useWatch({ control, name: "planned_start_at" });
  const steps = useWatch({ control, name: "steps" });

  return useMemo(() => {
    const totalMinutes = (steps ?? []).reduce((acc, step) => {
      const duration = Number(step?.duration_minutes);
      if (!Number.isFinite(duration) || duration <= 0) {
        return acc;
      }
      return acc + duration;
    }, 0);

    if (!plannedStartAt) {
      return { plannedEndAt: null, totalMinutes };
    }
    const start = new Date(plannedStartAt);
    if (!Number.isFinite(start.getTime())) {
      return { plannedEndAt: null, totalMinutes };
    }
    if (totalMinutes <= 0) {
      return { plannedEndAt: start, totalMinutes: 0 };
    }
    return {
      plannedEndAt: new Date(start.getTime() + totalMinutes * 60 * 1000),
      totalMinutes,
    };
  }, [plannedStartAt, steps]);
}
