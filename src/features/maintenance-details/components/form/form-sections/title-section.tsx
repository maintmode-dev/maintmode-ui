"use client";

import { useFormContext } from "react-hook-form";

import type { MaintenanceFormValues } from "@/features/maintenance-details/schemas/maintenance-form-schema";
import { Field, FieldControl, FieldLabel } from "@/shared/ui/primitives/field";
import { Input } from "@/shared/ui/primitives/input";
import { Textarea } from "@/shared/ui/primitives/textarea";

export function TitleSection({ disabled }: { disabled?: boolean }) {
  const {
    register,
    formState: { errors },
  } = useFormContext<MaintenanceFormValues>();

  return (
    <section className="flex flex-col gap-3">
      <Field error={errors.title?.message}>
        <FieldLabel>Title</FieldLabel>
        <FieldControl>
          <Input
            placeholder="DB migration"
            disabled={disabled}
            {...register("title")}
          />
        </FieldControl>
      </Field>
      <Field error={errors.description?.message}>
        <FieldLabel>Description</FieldLabel>
        <FieldControl>
          <Textarea
            rows={4}
            placeholder="What is being done and why"
            disabled={disabled}
            {...register("description")}
          />
        </FieldControl>
      </Field>
    </section>
  );
}
