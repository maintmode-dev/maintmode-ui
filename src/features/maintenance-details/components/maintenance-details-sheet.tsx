"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { MaintenanceSummary } from "@/domain/maintenance/models/maintenance";
import { CancelDialog, type CancelDialogResult } from "@/features/maintenance-details/components/cancel-dialog";
import { MaintenanceDetailsContent } from "@/features/maintenance-details/components/maintenance-details-content";
import { MaintenanceForm } from "@/features/maintenance-details/components/form/maintenance-form";
import { UnsavedChangesAlert } from "@/features/maintenance-details/components/unsaved-changes-alert";
import { mapFieldErrors } from "@/features/maintenance-details/hooks/use-field-error-mapper";
import { useMaintenanceForm } from "@/features/maintenance-details/hooks/use-maintenance-form";
import { useUnsavedChangesGuard } from "@/features/maintenance-details/hooks/use-unsaved-changes-guard";
import { useCreateMaintenanceMutation } from "@/features/maintenance-details/mutations/use-create-maintenance-mutation";
import { useMaintenanceActionMutation } from "@/features/maintenance-details/mutations/use-maintenance-action-mutation";
import { useUpdateMaintenanceMutation } from "@/features/maintenance-details/mutations/use-update-maintenance-mutation";
import { useMaintenanceDetailsQuery } from "@/features/maintenance-details/queries/use-maintenance-details-query";
import type { MaintenanceFormValues } from "@/features/maintenance-details/schemas/maintenance-form-schema";
import { Button } from "@/shared/ui/primitives/button";
import { Skeleton } from "@/shared/ui/primitives/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/primitives/sheet";

export type MaintenanceSheetMode = "view" | "create" | "edit";

type MaintenanceDetailsSheetProps = {
  maintenanceId: string | null;
  mode: MaintenanceSheetMode;
  /** ISO datetime used as `planned_start_at` default in create mode. */
  createDefaultStart?: string;
  onClose: () => void;
  onModeChange?: (mode: MaintenanceSheetMode) => void;
};

const SHEET_DESCRIPTION_ID = "maintenance-details-description";

export function MaintenanceDetailsSheet({
  maintenanceId,
  mode,
  createDefaultStart,
  onClose,
  onModeChange,
}: MaintenanceDetailsSheetProps) {
  const isOpen = mode === "create" ? true : Boolean(maintenanceId);
  const detailsQuery = useMaintenanceDetailsQuery(mode === "create" ? null : maintenanceId);
  const actionMutation = useMaintenanceActionMutation();
  const createMutation = useCreateMaintenanceMutation();
  const updateMutation = useUpdateMaintenanceMutation();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const data = detailsQuery.data;
  const isFormMode = mode === "create" || mode === "edit";
  const formDefaults = useMemo<Partial<MaintenanceFormValues> | undefined>(() => {
    if (mode === "create") {
      return createDefaultStart ? { planned_start_at: createDefaultStart } : undefined;
    }
    if (mode === "edit" && data) {
      return {
        title: data.title,
        description: data.description,
        planned_start_at: toDatetimeLocal(data.planned_start_at),
        impact: (data.impact as MaintenanceFormValues["impact"]) ?? "none",
        scope: data.scope,
        resource_ids: data.resources.map((resource) => resource.id),
        steps: (data.steps ?? []).map((step) => ({
          order: step.order,
          description: step.description,
          rollback_description: step.rollback_description,
          duration_minutes: step.duration_minutes,
        })),
      };
    }
    return undefined;
  }, [mode, createDefaultStart, data]);

  const { form, steps } = useMaintenanceForm({ defaultValues: formDefaults });

  // Re-sync defaults when entering edit mode with newly-loaded details, or
  // when the create default start changes (e.g. user picks a different slot).
  // We track the keys that should trigger a reset and avoid calling setState
  // synchronously inside the effect body.
  const lastResetKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isFormMode || !formDefaults) {
      return;
    }
    const key = `${mode}:${maintenanceId ?? "new"}:${data?.revision ?? "-"}:${createDefaultStart ?? "-"}`;
    if (lastResetKeyRef.current === key) {
      return;
    }
    lastResetKeyRef.current = key;
    form.reset(formDefaults as MaintenanceFormValues);
  }, [isFormMode, mode, maintenanceId, data?.revision, createDefaultStart, form, formDefaults]);

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleClose = () => {
    setSubmitError(null);
    onClose();
  };

  const guard = useUnsavedChangesGuard({
    isDirty: isFormMode && form.formState.isDirty,
    onDiscard: handleClose,
  });

  const handleSubmit = async (values: MaintenanceFormValues) => {
    setSubmitError(null);
    const input = {
      title: values.title,
      description: values.description,
      planned_start_at: toIso(values.planned_start_at),
      impact: values.impact,
      scope: values.scope,
      resource_ids: values.scope === "resource" ? values.resource_ids : undefined,
      steps: values.steps,
    };
    try {
      if (mode === "create") {
        await createMutation.mutateAsync(input);
      } else if (mode === "edit" && maintenanceId) {
        await updateMutation.mutateAsync({ id: maintenanceId, ...input });
      }
      onClose();
    } catch (error) {
      const mapped = mapFieldErrors<MaintenanceFormValues>(error, form.setError);
      if (!mapped) {
        setSubmitError(error instanceof Error ? error.message : "Save failed");
      }
    }
  };

  const runAction = (action: "approve" | "start" | "finish") => {
    if (!data || !maintenanceId) {
      return;
    }
    if (action === "approve") {
      if (typeof data.revision !== "number") {
        return;
      }
      actionMutation.mutate({
        maintenanceId,
        action: "approve",
        payload: {
          observed_maint_revision: data.revision,
          conflicts_snapshot: [],
        },
      });
      return;
    }
    actionMutation.mutate({ maintenanceId, action, payload: undefined });
  };

  const submitCancel = (result: CancelDialogResult) => {
    if (!maintenanceId) {
      return;
    }
    actionMutation.mutate(
      {
        maintenanceId,
        action: "cancel",
        payload: { reason: result.reason, comment: result.comment },
      },
      {
        onSuccess: () => setCancelOpen(false),
      },
    );
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (open) {
          return;
        }
        guard.requestClose();
      }}
    >
      <SheetContent aria-describedby={SHEET_DESCRIPTION_ID} className="overflow-hidden">
        <SheetHeader>
          <SheetTitle>{titleForMode(mode, data)}</SheetTitle>
          <SheetDescription id={SHEET_DESCRIPTION_ID}>{descriptionForMode(mode)}</SheetDescription>
        </SheetHeader>

        {isFormMode ? (
          <MaintenanceForm
            form={form}
            steps={steps}
            mode={mode === "edit" ? "edit" : "create"}
            isPending={isPending}
            submitError={submitError}
            onSubmit={handleSubmit}
            onCancel={() => guard.requestClose()}
          />
        ) : detailsQuery.isLoading ? (
          <DetailsSkeleton />
        ) : detailsQuery.isError ? (
          <DetailsErrorState onClose={handleClose} />
        ) : !data ? null : (
          <>
            <div className="flex-1 overflow-y-auto pb-4">
              <MaintenanceDetailsContent data={data} />
            </div>
            <div className="mt-auto flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] pt-3">
              <ActionButtons
                summary={data}
                pending={actionMutation.isPending}
                onAction={runAction}
                onCancelClick={() => setCancelOpen(true)}
                onEditClick={() => onModeChange?.("edit")}
              />
              <Button variant="ghost" size="sm" onClick={handleClose} disabled={actionMutation.isPending}>
                Close
              </Button>
            </div>
            {actionMutation.error ? (
              <p className="text-xs text-[var(--danger-fg)]" role="alert">
                {actionMutation.error.message}
              </p>
            ) : null}
          </>
        )}
      </SheetContent>
      <CancelDialog
        open={cancelOpen}
        pending={actionMutation.isPending}
        onOpenChange={setCancelOpen}
        onConfirm={submitCancel}
      />
      <UnsavedChangesAlert
        open={guard.guardOpen}
        onCancel={guard.cancelDiscard}
        onConfirm={guard.confirmDiscard}
      />
    </Sheet>
  );
}

function ActionButtons({
  summary,
  pending,
  onAction,
  onCancelClick,
  onEditClick,
}: {
  summary: MaintenanceSummary;
  pending: boolean;
  onAction: (action: "approve" | "start" | "finish") => void;
  onCancelClick: () => void;
  onEditClick?: () => void;
}) {
  const actions = summary.actions;
  const canApprove = actions?.can_approve === true && typeof summary.revision === "number";
  return (
    <div className="flex flex-wrap gap-2">
      {actions?.can_edit && onEditClick ? (
        <Button variant="secondary" size="sm" disabled={pending} onClick={onEditClick}>
          Edit
        </Button>
      ) : null}
      {actions?.can_approve ? (
        <Button
          variant="primary"
          size="sm"
          disabled={pending || !canApprove}
          title={!canApprove ? "Reload the maintenance to fetch its revision before approving" : undefined}
          onClick={() => onAction("approve")}
        >
          Approve
        </Button>
      ) : null}
      {actions?.can_start ? (
        <Button variant="primary" size="sm" disabled={pending} onClick={() => onAction("start")}>
          Start
        </Button>
      ) : null}
      {actions?.can_finish ? (
        <Button variant="primary" size="sm" disabled={pending} onClick={() => onAction("finish")}>
          Finish
        </Button>
      ) : null}
      {actions?.can_cancel ? (
        <Button variant="danger" size="sm" disabled={pending} onClick={onCancelClick}>
          Cancel
        </Button>
      ) : null}
    </div>
  );
}

function DetailsSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

function DetailsErrorState({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-start gap-3" role="alert">
      <h2 className="text-base font-semibold text-[var(--danger-fg)]">Could not load maintenance</h2>
      <p className="text-sm text-[var(--danger-fg)]">The backend request failed. Close the panel and retry.</p>
      <Button variant="secondary" size="sm" onClick={onClose}>
        Close
      </Button>
    </div>
  );
}

function titleForMode(mode: MaintenanceSheetMode, data: MaintenanceSummary | undefined) {
  if (mode === "create") return "New maintenance";
  if (mode === "edit") return data?.title ? `Edit: ${data.title}` : "Edit maintenance";
  return data?.title ?? "Maintenance details";
}

function descriptionForMode(mode: MaintenanceSheetMode) {
  if (mode === "create") return "Schedule a maintenance with planned start and ordered steps.";
  if (mode === "edit") return "Update the draft. Computed end follows the step durations.";
  return "Review the details and run available actions.";
}

function toDatetimeLocal(iso: string | undefined): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIso(value: string): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }
  return date.toISOString();
}
