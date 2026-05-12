"use client";

import { useState } from "react";

import { format, parseISO } from "date-fns";

import type { MaintenanceStatus, MaintenanceSummary } from "@/domain/maintenance/models/maintenance";
import { MAINTENANCE_STATUS_LABEL } from "@/domain/maintenance/rules/status";
import { useMaintenanceDetailsQuery } from "@/features/maintenance-details/queries/use-maintenance-details-query";
import { useMaintenanceActionMutation } from "@/features/maintenance-details/mutations/use-maintenance-action-mutation";
import { CancelDialog, type CancelDialogResult } from "@/features/maintenance-details/components/cancel-dialog";
import { Badge } from "@/shared/ui/primitives/badge";
import { Button } from "@/shared/ui/primitives/button";
import { Skeleton } from "@/shared/ui/primitives/skeleton";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/primitives/sheet";

type MaintenanceDetailsSheetProps = {
  maintenanceId: string | null;
  onClose: () => void;
};

const STATUS_TONE: Record<MaintenanceStatus, "info" | "warning" | "success" | "danger" | "neutral"> = {
  draft: "neutral",
  planned: "info",
  in_progress: "warning",
  completed: "success",
  canceled: "danger",
};

export function MaintenanceDetailsSheet({ maintenanceId, onClose }: MaintenanceDetailsSheetProps) {
  const detailsQuery = useMaintenanceDetailsQuery(maintenanceId);
  const actionMutation = useMaintenanceActionMutation();
  const [cancelOpen, setCancelOpen] = useState(false);

  const isOpen = Boolean(maintenanceId);
  const data = detailsQuery.data;

  const runAction = (action: "approve" | "start" | "finish") => {
    if (!data || !maintenanceId) {
      return;
    }
    if (action === "approve") {
      // `revision` is required by the backend optimistic-concurrency check.
      // `0` is a valid value, so we cannot fall back to it — bail out and
      // let the human re-open the sheet to fetch a real revision instead
      // of silently approving a stale view.
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
    <Sheet open={isOpen} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent aria-describedby="maintenance-details-description">
        {detailsQuery.isLoading ? (
          <DetailsSkeleton />
        ) : detailsQuery.isError ? (
          <DetailsErrorState onClose={onClose} />
        ) : !data ? null : (
          <>
            <SheetHeader>
              <div className="flex items-center justify-between gap-2">
                <Badge tone={STATUS_TONE[data.status] ?? "neutral"}>{MAINTENANCE_STATUS_LABEL[data.status]}</Badge>
                {data.has_conflict ? <Badge tone="danger">Conflict</Badge> : null}
              </div>
              <SheetTitle>{data.title}</SheetTitle>
              <SheetDescription id="maintenance-details-description">{data.description}</SheetDescription>
            </SheetHeader>

            <section className="flex flex-col gap-3 text-sm">
              <DetailRow label="Planned">
                {formatRange(data.planned_start_at, data.planned_end_at)}
              </DetailRow>
              {data.actual_start_at || data.actual_end_at ? (
                <DetailRow label="Actual" tone="warning">
                  {formatRange(data.actual_start_at, data.actual_end_at)}
                </DetailRow>
              ) : null}
              <DetailRow label="Scope">{data.scope === "global" ? "Global" : "Resource"}</DetailRow>
              <DetailRow label="Impact">{formatImpact(data.impact)}</DetailRow>
              {data.resources.length > 0 ? (
                <DetailRow label="Resources">
                  <ul className="flex flex-wrap gap-1">
                    {data.resources.map((resource) => (
                      <li key={resource.id}>
                        <Badge tone="muted">{resource.name}</Badge>
                      </li>
                    ))}
                  </ul>
                </DetailRow>
              ) : null}
              {data.conflicts.length > 0 ? (
                <DetailRow label="Conflicts" tone="danger">
                  <ul className="flex flex-col gap-1 text-xs">
                    {data.conflicts.map((conflict) => (
                      <li key={conflict.maintenance_id}>
                        <span className="font-semibold">{conflict.maintenance_title}</span>{" "}
                        <span className="text-[var(--muted)]">
                          ({formatRange(conflict.overlap_start, conflict.overlap_end)})
                        </span>
                      </li>
                    ))}
                  </ul>
                </DetailRow>
              ) : null}
            </section>

            <SheetFooter className="flex-wrap gap-2">
              <ActionButtons
                summary={data}
                pending={actionMutation.isPending}
                onAction={runAction}
                onCancelClick={() => setCancelOpen(true)}
              />
              <SheetClose asChild>
                <Button variant="ghost" size="sm">
                  Close
                </Button>
              </SheetClose>
            </SheetFooter>

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
    </Sheet>
  );
}

function ActionButtons({
  summary,
  pending,
  onAction,
  onCancelClick,
}: {
  summary: MaintenanceSummary;
  pending: boolean;
  onAction: (action: "approve" | "start" | "finish") => void;
  onCancelClick: () => void;
}) {
  const actions = summary.actions;
  // Approve requires the backend revision for optimistic concurrency.
  const canApprove = actions?.can_approve === true && typeof summary.revision === "number";
  return (
    <div className="flex flex-wrap gap-2">
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

function DetailRow({
  label,
  children,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  tone?: "warning" | "danger";
}) {
  const labelClass =
    tone === "warning"
      ? "text-[var(--warning-fg)]"
      : tone === "danger"
        ? "text-[var(--danger-fg)]"
        : "text-[var(--muted)]";
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 border-t border-[var(--border)] py-2">
      <span className={`text-xs font-semibold uppercase tracking-wide ${labelClass}`}>{label}</span>
      <div className="text-[var(--foreground)]">{children}</div>
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

function formatRange(startIso: string | undefined, endIso: string | undefined): string {
  if (!startIso) {
    return "—";
  }
  const start = parseISO(startIso);
  const end = endIso ? parseISO(endIso) : null;
  if (end && sameDay(start, end)) {
    return `${format(start, "PPp")} – ${format(end, "p")}`;
  }
  if (end) {
    return `${format(start, "PPp")} – ${format(end, "PPp")}`;
  }
  return format(start, "PPp");
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatImpact(impact: string) {
  if (impact === "partial_outage") return "Partial outage";
  if (impact === "full_outage") return "Full outage";
  if (impact === "none") return "No impact";
  return impact;
}
