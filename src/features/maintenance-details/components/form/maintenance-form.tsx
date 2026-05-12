"use client";

import { useEffect } from "react";
import { FormProvider, type UseFormReturn } from "react-hook-form";

import { TitleSection } from "@/features/maintenance-details/components/form/form-sections/title-section";
import { TimeSection } from "@/features/maintenance-details/components/form/form-sections/time-section";
import { ScopeSection } from "@/features/maintenance-details/components/form/form-sections/scope-section";
import { StepsSection } from "@/features/maintenance-details/components/form/form-sections/steps-section";
import type { StepHelpers } from "@/features/maintenance-details/hooks/use-maintenance-form";
import type { MaintenanceFormValues } from "@/features/maintenance-details/schemas/maintenance-form-schema";
import { Button } from "@/shared/ui/primitives/button";

export type MaintenanceFormProps = {
  form: UseFormReturn<MaintenanceFormValues>;
  steps: StepHelpers;
  mode: "create" | "edit";
  isPending: boolean;
  submitError?: string | null;
  onSubmit: (values: MaintenanceFormValues) => void;
  onCancel: () => void;
  formId?: string;
};

export function MaintenanceForm({
  form,
  steps,
  mode,
  isPending,
  submitError,
  onSubmit,
  onCancel,
  formId = "maintenance-form",
}: MaintenanceFormProps) {
  // Re-stamp step.order whenever the order count changes so blank-row inserts
  // never leave gaps. Run as a defensive sync; helpers already stamp on add/
  // remove/move, but RHF defaultValues may set non-1..N values for edit mode.
  useEffect(() => {
    const current = form.getValues("steps");
    let needs = false;
    for (let i = 0; i < current.length; i++) {
      if (current[i].order !== i + 1) {
        needs = true;
        break;
      }
    }
    if (needs) {
      form.setValue(
        "steps",
        current.map((step, i) => ({ ...step, order: i + 1 })),
        { shouldDirty: false },
      );
    }
  }, [form, steps.fields.length]);

  return (
    <FormProvider {...form}>
      <form
        id={formId}
        noValidate
        className="flex flex-1 flex-col gap-5 overflow-y-auto pb-4"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        {submitError ? (
          <div
            role="alert"
            className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger-fg)]"
          >
            {submitError}
          </div>
        ) : null}
        <TitleSection disabled={isPending} />
        <TimeSection disabled={isPending} />
        <ScopeSection disabled={isPending} />
        <StepsSection steps={steps} disabled={isPending} />
      </form>
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] pt-3">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button
          type="submit"
          form={formId}
          variant="primary"
          size="sm"
          disabled={isPending}
          data-testid="maintenance-form-submit"
        >
          {isPending ? "Saving…" : mode === "create" ? "Create maintenance" : "Save changes"}
        </Button>
      </div>
    </FormProvider>
  );
}
