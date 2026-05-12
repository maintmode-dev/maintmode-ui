"use client";

import { useFormContext } from "react-hook-form";
import { format } from "date-fns";

import { usePlannedEndAt } from "@/features/maintenance-details/hooks/use-planned-end-at";
import type { MaintenanceFormValues } from "@/features/maintenance-details/schemas/maintenance-form-schema";
import { Field, FieldControl, FieldLabel } from "@/shared/ui/primitives/field";
import { Input } from "@/shared/ui/primitives/input";

export function TimeSection({ disabled }: { disabled?: boolean }) {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<MaintenanceFormValues>();
  const { plannedEndAt, totalMinutes } = usePlannedEndAt(control);

  return (
    <section className="flex flex-col gap-3">
      <Field
        error={errors.planned_start_at?.message}
        hint="UI computes the end from the step durations below."
      >
        <FieldLabel>Planned start</FieldLabel>
        <FieldControl>
          <Input
            type="datetime-local"
            disabled={disabled}
            {...register("planned_start_at")}
          />
        </FieldControl>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Computed end
          </span>
          <span data-testid="computed-end" className="text-sm text-[var(--foreground)]">
            {plannedEndAt ? format(plannedEndAt, "PPp") : "—"}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Total duration
          </span>
          <span data-testid="total-duration" className="text-sm text-[var(--foreground)]">
            {formatMinutes(totalMinutes)}
          </span>
        </div>
      </div>
    </section>
  );
}

function formatMinutes(total: number) {
  if (total <= 0) {
    return "0m";
  }
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) {
    return `${minutes}m`;
  }
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}
