"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { CancelDialog, type CancelDialogResult } from "@/features/maintenance-details/components/cancel-dialog";
import { MaintenanceDetailsContent } from "@/features/maintenance-details/components/maintenance-details-content";
import { MaintenanceForm } from "@/features/maintenance-details/components/form/maintenance-form";
import { UnsavedChangesAlert } from "@/features/maintenance-details/components/unsaved-changes-alert";
import { mapFieldErrors } from "@/features/maintenance-details/hooks/use-field-error-mapper";
import { useMaintenanceForm } from "@/features/maintenance-details/hooks/use-maintenance-form";
import { useUnsavedChangesGuard } from "@/features/maintenance-details/hooks/use-unsaved-changes-guard";
import { useMaintenanceActionMutation } from "@/features/maintenance-details/mutations/use-maintenance-action-mutation";
import { useUpdateMaintenanceMutation } from "@/features/maintenance-details/mutations/use-update-maintenance-mutation";
import { useMaintenanceDetailsQuery } from "@/features/maintenance-details/queries/use-maintenance-details-query";
import type { MaintenanceFormValues } from "@/features/maintenance-details/schemas/maintenance-form-schema";
import { Button } from "@/shared/ui/primitives/button";
import { Skeleton } from "@/shared/ui/primitives/skeleton";

export type MaintenanceDetailsPageProps = {
  id: string;
};

export function MaintenanceDetailsPage({ id }: MaintenanceDetailsPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editing = searchParams.get("edit") === "1";

  const detailsQuery = useMaintenanceDetailsQuery(id);
  const actionMutation = useMaintenanceActionMutation();
  const updateMutation = useUpdateMaintenanceMutation();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const data = detailsQuery.data;

  const formDefaults = useMemo<Partial<MaintenanceFormValues> | undefined>(() => {
    if (!editing || !data) return undefined;
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
  }, [editing, data]);

  const { form, steps } = useMaintenanceForm({ defaultValues: formDefaults });

  const lastResetKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editing || !formDefaults) {
      return;
    }
    const key = `${data?.revision ?? "-"}`;
    if (lastResetKeyRef.current === key) {
      return;
    }
    lastResetKeyRef.current = key;
    form.reset(formDefaults as MaintenanceFormValues);
  }, [editing, data?.revision, form, formDefaults]);

  const exitEdit = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("edit");
    const query = params.toString();
    router.replace(`/maintenance/${encodeURIComponent(id)}${query ? `?${query}` : ""}`, {
      scroll: false,
    });
    setSubmitError(null);
  }, [id, router, searchParams]);

  const enterEdit = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("edit", "1");
    router.replace(`/maintenance/${encodeURIComponent(id)}?${params.toString()}`, { scroll: false });
  }, [id, router, searchParams]);

  const guard = useUnsavedChangesGuard({
    isDirty: editing && form.formState.isDirty,
    onDiscard: exitEdit,
  });

  const handleSubmit = async (values: MaintenanceFormValues) => {
    setSubmitError(null);
    try {
      await updateMutation.mutateAsync({
        id,
        title: values.title,
        description: values.description,
        planned_start_at: toIso(values.planned_start_at),
        impact: values.impact,
        scope: values.scope,
        resource_ids: values.scope === "resource" ? values.resource_ids : undefined,
        steps: values.steps,
      });
      exitEdit();
    } catch (error) {
      const mapped = mapFieldErrors<MaintenanceFormValues>(error, form.setError);
      if (!mapped) {
        setSubmitError(error instanceof Error ? error.message : "Save failed");
      }
    }
  };

  const runAction = (action: "approve" | "start" | "finish") => {
    if (!data) return;
    if (action === "approve") {
      if (typeof data.revision !== "number") return;
      actionMutation.mutate({
        maintenanceId: id,
        action: "approve",
        payload: { observed_maint_revision: data.revision, conflicts_snapshot: [] },
      });
      return;
    }
    actionMutation.mutate({ maintenanceId: id, action, payload: undefined });
  };

  const submitCancel = (result: CancelDialogResult) => {
    actionMutation.mutate(
      {
        maintenanceId: id,
        action: "cancel",
        payload: { reason: result.reason, comment: result.comment },
      },
      { onSuccess: () => setCancelOpen(false) },
    );
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
          <ArrowLeft className="h-4 w-4" />
          Back to calendar
        </Link>
        {!editing && data?.actions?.can_edit ? (
          <Button variant="secondary" size="sm" onClick={enterEdit}>
            Edit
          </Button>
        ) : null}
      </div>

      {detailsQuery.isLoading ? (
        <PageSkeleton />
      ) : detailsQuery.isError || !data ? (
        <div role="alert" className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger-fg)]">
          Could not load maintenance.
        </div>
      ) : editing ? (
        <MaintenanceForm
          form={form}
          steps={steps}
          mode="edit"
          isPending={updateMutation.isPending}
          submitError={submitError}
          onSubmit={handleSubmit}
          onCancel={() => guard.requestClose()}
        />
      ) : (
        <>
          <MaintenanceDetailsContent data={data} />
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] pt-3">
            {data.actions?.can_approve ? (
              <Button
                variant="primary"
                size="sm"
                disabled={actionMutation.isPending || typeof data.revision !== "number"}
                onClick={() => runAction("approve")}
              >
                Approve
              </Button>
            ) : null}
            {data.actions?.can_start ? (
              <Button variant="primary" size="sm" disabled={actionMutation.isPending} onClick={() => runAction("start")}>
                Start
              </Button>
            ) : null}
            {data.actions?.can_finish ? (
              <Button variant="primary" size="sm" disabled={actionMutation.isPending} onClick={() => runAction("finish")}>
                Finish
              </Button>
            ) : null}
            {data.actions?.can_cancel ? (
              <Button variant="danger" size="sm" disabled={actionMutation.isPending} onClick={() => setCancelOpen(true)}>
                Cancel
              </Button>
            ) : null}
          </div>
          {actionMutation.error ? (
            <p role="alert" className="text-xs text-[var(--danger-fg)]">
              {actionMutation.error.message}
            </p>
          ) : null}
        </>
      )}

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
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}

function toDatetimeLocal(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIso(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toISOString();
}
