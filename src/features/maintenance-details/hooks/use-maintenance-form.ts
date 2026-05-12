"use client";

import { useCallback } from "react";
import { useForm, useFieldArray, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  makeDefaultFormValues,
  makeEmptyStep,
  maintenanceFormSchema,
  type MaintenanceFormStep,
  type MaintenanceFormValues,
} from "@/features/maintenance-details/schemas/maintenance-form-schema";

export type UseMaintenanceFormOptions = {
  defaultValues?: Partial<MaintenanceFormValues>;
};

export type StepHelpers = {
  fields: ReturnType<typeof useFieldArray<MaintenanceFormValues, "steps", "_key">>["fields"];
  addStep: () => void;
  removeStep: (index: number) => void;
  moveStep: (from: number, to: number) => void;
};

export type UseMaintenanceFormResult = {
  form: UseFormReturn<MaintenanceFormValues>;
  steps: StepHelpers;
};

/**
 * Wraps react-hook-form + zodResolver and exposes a `useFieldArray` for steps
 * with `order` re-stamping helpers. RHF tracks rows by the stable `_key`, so
 * mutating each row's `order` field is safe.
 */
export function useMaintenanceForm({ defaultValues }: UseMaintenanceFormOptions = {}): UseMaintenanceFormResult {
  const form = useForm<MaintenanceFormValues>({
    resolver: zodResolver(maintenanceFormSchema),
    defaultValues: makeDefaultFormValues(defaultValues),
    mode: "onBlur",
  });

  const stepsArray = useFieldArray<MaintenanceFormValues, "steps", "_key">({
    control: form.control,
    name: "steps",
    keyName: "_key",
  });

  const restampOrder = useCallback(
    (rows: MaintenanceFormStep[]): MaintenanceFormStep[] =>
      rows.map((row, index) => ({ ...row, order: index + 1 })),
    [],
  );

  const addStep = useCallback(() => {
    const nextOrder = stepsArray.fields.length + 1;
    stepsArray.append(makeEmptyStep(nextOrder));
  }, [stepsArray]);

  const removeStep = useCallback(
    (index: number) => {
      const current = form.getValues("steps");
      if (current.length <= 1) {
        return;
      }
      const next = restampOrder(current.filter((_, i) => i !== index));
      stepsArray.replace(next);
    },
    [form, restampOrder, stepsArray],
  );

  const moveStep = useCallback(
    (from: number, to: number) => {
      const current = form.getValues("steps");
      if (from < 0 || from >= current.length || to < 0 || to >= current.length || from === to) {
        return;
      }
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      stepsArray.replace(restampOrder(next));
    },
    [form, restampOrder, stepsArray],
  );

  return {
    form,
    steps: {
      fields: stepsArray.fields,
      addStep,
      removeStep,
      moveStep,
    },
  };
}
