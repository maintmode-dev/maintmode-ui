"use client";

import { useFormContext } from "react-hook-form";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import type { StepHelpers } from "@/features/maintenance-details/hooks/use-maintenance-form";
import type { MaintenanceFormValues } from "@/features/maintenance-details/schemas/maintenance-form-schema";
import { Button } from "@/shared/ui/primitives/button";
import { Field, FieldControl, FieldLabel } from "@/shared/ui/primitives/field";
import { Input } from "@/shared/ui/primitives/input";
import { Textarea } from "@/shared/ui/primitives/textarea";

type StepsSectionProps = {
  steps: StepHelpers;
  disabled?: boolean;
};

export function StepsSection({ steps, disabled }: StepsSectionProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext<MaintenanceFormValues>();
  const stepsError = errors.steps;
  const rootStepsMessage =
    stepsError && !Array.isArray(stepsError) && typeof stepsError.message === "string"
      ? stepsError.message
      : undefined;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">Steps</h3>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={steps.addStep}
          disabled={disabled}
          aria-label="Add step"
        >
          <Plus className="h-3.5 w-3.5" />
          Add step
        </Button>
      </div>
      {rootStepsMessage ? (
        <p role="alert" className="text-xs text-[var(--danger-fg)]">
          {rootStepsMessage}
        </p>
      ) : null}
      <ol className="flex flex-col gap-3">
        {steps.fields.map((field, index) => {
          const rowErrors = (errors.steps as Array<Record<string, { message?: string }> | undefined> | undefined)?.[index];
          return (
            <li
              key={field._key}
              className="rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] p-3"
              data-testid={`step-row-${index}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Step {index + 1}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Move step ${index + 1} up`}
                    disabled={disabled || index === 0}
                    onClick={() => steps.moveStep(index, index - 1)}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Move step ${index + 1} down`}
                    disabled={disabled || index === steps.fields.length - 1}
                    onClick={() => steps.moveStep(index, index + 1)}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove step ${index + 1}`}
                    disabled={disabled || steps.fields.length <= 1}
                    onClick={() => steps.removeStep(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <input type="hidden" {...register(`steps.${index}.order`, { valueAsNumber: true })} />
              <div className="flex flex-col gap-2">
                <Field error={rowErrors?.description?.message}>
                  <FieldLabel>What is done</FieldLabel>
                  <FieldControl>
                    <Textarea
                      rows={2}
                      disabled={disabled}
                      {...register(`steps.${index}.description`)}
                    />
                  </FieldControl>
                </Field>
                <Field error={rowErrors?.rollback_description?.message}>
                  <FieldLabel>Rollback</FieldLabel>
                  <FieldControl>
                    <Textarea
                      rows={2}
                      disabled={disabled}
                      {...register(`steps.${index}.rollback_description`)}
                    />
                  </FieldControl>
                </Field>
                <Field error={rowErrors?.duration_minutes?.message}>
                  <FieldLabel>Duration (minutes)</FieldLabel>
                  <FieldControl>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      disabled={disabled}
                      {...register(`steps.${index}.duration_minutes`, { valueAsNumber: true })}
                    />
                  </FieldControl>
                </Field>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
