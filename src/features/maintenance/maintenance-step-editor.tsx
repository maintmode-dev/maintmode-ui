"use client";

import { GripVertical, Plus, Trash2 } from "lucide-react";

import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";
import { Label } from "@/shared/ui/shadcn/label";
import { Textarea } from "@/shared/ui/shadcn/textarea";
import { cn } from "@/shared/ui/lib/cn";

/**
 * The editor's working row. `duration_minutes` is the human input (a plain
 * minute count); the form serializes it to the Go-duration string the write
 * contract expects (`"30m"`, `"90m"`) at submit time. Kept separate from the
 * domain `MaintenanceStepInput` so the UI can hold an empty/in-progress row
 * without coercing it to a wire shape on every keystroke.
 */
export interface StepDraft {
  description: string;
  rollback_description: string;
  /** Minutes; empty string while the field is being typed/cleared. */
  duration_minutes: string;
}

export function emptyStep(): StepDraft {
  return { description: "", rollback_description: "", duration_minutes: "" };
}

/** Minimum step duration the backend enforces (TC-MAINT-02 #9). */
export const MIN_STEP_MINUTES = 5;

export interface MaintenanceStepEditorProps {
  steps: StepDraft[];
  onChange: (steps: StepDraft[]) => void;
  disabled?: boolean;
}

/**
 * Add/remove/edit ordered maintenance steps (RUK-42 / RUK-163). Each step
 * carries a description, a rollback plan, and a duration in minutes — all
 * required by the backend, with a 5-minute floor. Order is implicit (row
 * position, 1-based); the form assigns `order` at submit.
 */
export function MaintenanceStepEditor({ steps, onChange, disabled }: MaintenanceStepEditorProps) {
  const update = (index: number, patch: Partial<StepDraft>) => {
    onChange(steps.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  };
  const remove = (index: number) => {
    onChange(steps.filter((_, i) => i !== index));
  };
  const add = () => {
    onChange([...steps, emptyStep()]);
  };

  return (
    <div className="space-y-3">
      {steps.map((step, index) => {
        const minutes = Number(step.duration_minutes);
        const tooShort =
          step.duration_minutes !== "" && Number.isFinite(minutes) && minutes < MIN_STEP_MINUTES;
        return (
          <div key={index} className="rounded-md border border-border-subtle bg-bg-elev-2 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-fg-dim">
                <GripVertical className="size-3.5" aria-hidden="true" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">
                  Step {index + 1}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="ml-auto text-fg-muted hover:text-fg"
                aria-label={`Remove step ${index + 1}`}
                onClick={() => remove(index)}
                disabled={disabled || steps.length <= 1}
                title={steps.length <= 1 ? "At least one step is required" : undefined}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>

            <StepField label="Description" htmlFor={`step-${index}-desc`}>
              <Textarea
                id={`step-${index}-desc`}
                value={step.description}
                onChange={(e) => update(index, { description: e.target.value })}
                rows={2}
                placeholder="What this step does"
                disabled={disabled}
                required
              />
            </StepField>

            <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
              <StepField label="Rollback plan" htmlFor={`step-${index}-rollback`}>
                <Textarea
                  id={`step-${index}-rollback`}
                  value={step.rollback_description}
                  onChange={(e) => update(index, { rollback_description: e.target.value })}
                  rows={2}
                  placeholder="How to undo it"
                  disabled={disabled}
                  required
                />
              </StepField>
              <StepField label="Duration (min)" htmlFor={`step-${index}-dur`}>
                <Input
                  id={`step-${index}-dur`}
                  type="number"
                  inputMode="numeric"
                  min={MIN_STEP_MINUTES}
                  step={1}
                  value={step.duration_minutes}
                  onChange={(e) => update(index, { duration_minutes: e.target.value })}
                  className={cn("w-24 tabular-nums", tooShort && "border-destructive")}
                  placeholder={String(MIN_STEP_MINUTES)}
                  disabled={disabled}
                  required
                  aria-invalid={tooShort}
                />
                {tooShort ? <p className="text-xs text-destructive">Min {MIN_STEP_MINUTES} min</p> : null}
              </StepField>
            </div>
          </div>
        );
      })}

      <Button type="button" variant="outline" size="sm" onClick={add} disabled={disabled}>
        <Plus className="size-3.5" aria-hidden="true" /> Add step
      </Button>
    </div>
  );
}

function StepField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim">
        {label}
      </Label>
      {children}
    </div>
  );
}
