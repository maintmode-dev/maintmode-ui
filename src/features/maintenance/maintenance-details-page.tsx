"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CircleSlash, Edit2, History, Play, PlayCircle, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/ui/shadcn/button";
import { Separator } from "@/shared/ui/shadcn/separator";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/shadcn/tabs";
import { StatusBadge } from "@/shared/ui/domain/status-badge";
import { ImpactBadge } from "@/shared/ui/domain/impact-badge";
import { ResourceChip } from "@/shared/ui/domain/resource-chip";
import { StepRow } from "@/shared/ui/domain/step-row";
import { ConflictCard, ConflictGridItem } from "@/shared/ui/domain/conflict-card";
import { DetailsError, DetailsForbidden, DetailsLoading, DetailsNotFound } from "@/shared/ui/states";
import { formatRange, formatDateTime } from "@/shared/ui/lib/format";
import { BffError } from "@/features/_shared/api/bff-fetch";

import { CancelMaintenanceDialog } from "./cancel-maintenance-dialog";
import { MaintenanceEditMode } from "./maintenance-edit-mode";
import { useMaintenanceDetailQuery } from "./queries/use-maintenance-detail-query";
import { useCancelMaintenance, useMaintenanceAction } from "./queries/use-maintenance-actions";
import type { CancelReason } from "@/domain/maintenance/maintenance";

export interface MaintenanceDetailsPageProps {
  /** Existing maintenance id. Omit when `creating` (no entity exists yet). */
  id?: string;
  /**
   * Render the create-draft flow (`/maintenance/new`): the page in edit-mode
   * with empty fields, a create-specific top bar/footer, and a neutral
   * conflicts note — no detail fetch. Per the design, there is no separate
   * "Create maintenance" screen; creating IS this page in the `creating` state.
   */
  creating?: boolean;
}

export function MaintenanceDetailsPage({ id, creating = false }: MaintenanceDetailsPageProps) {
  if (creating) return <MaintenanceCreateView />;
  return <MaintenanceDetailView id={id as string} />;
}

/**
 * The `creating` state — this page rendered as a new-draft form. Reuses the
 * shared edit/create form (`MaintenanceEditMode` in create mode) inside the
 * same 60/40 shell, with a back-to-calendar top bar and a conflicts panel that
 * just notes conflicts are computed after the draft is saved.
 */
function MaintenanceCreateView() {
  const router = useRouter();
  return (
    <article className="grid grid-cols-[60%_40%] min-h-[calc(100vh-56px)]">
      {/* LEFT */}
      <div className="p-8 overflow-auto space-y-6">
        <header className="space-y-3">
          <div className="flex items-center gap-3 text-xs font-mono text-fg-dim">
            <Link href="/" className="hover:text-fg flex items-center gap-1">
              <ArrowLeft className="size-3" aria-hidden="true" /> Back to calendar
            </Link>
          </div>
          <h1 className="h1">New maintenance</h1>
          <p className="text-sm text-fg-muted m-0">
            Plan a maintenance window. It’s saved as a draft you can review and submit for approval.
          </p>
        </header>

        <MaintenanceEditMode creating onClose={() => router.push("/")} />
      </div>

      {/* RIGHT */}
      <aside className="p-7 bg-bg-elev-2 border-l border-border-subtle overflow-auto space-y-4">
        <header className="flex items-baseline gap-3">
          <h2 className="h2">Conflicts</h2>
        </header>
        <p className="caption">Conflicts are checked after you save the draft.</p>
      </aside>
    </article>
  );
}

function MaintenanceDetailView({ id }: { id: string }) {
  const query = useMaintenanceDetailQuery(id);
  const actionMutation = useMaintenanceAction();
  const cancelMutation = useCancelMaintenance();

  const [mode, setMode] = useState<"view" | "edit">("view");
  const [cancelOpen, setCancelOpen] = useState(false);

  if (query.isPending) return <DetailsLoading />;
  if (query.isError) {
    const err = query.error;
    if (err instanceof BffError && err.status === 404) {
      return (
        <DetailsNotFound
          cta={
            <Button asChild variant="outline" size="sm">
              <Link href="/">
                <ArrowLeft className="size-3" aria-hidden="true" /> Back to calendar
              </Link>
            </Button>
          }
        />
      );
    }
    if (err instanceof BffError && err.status === 403) return <DetailsForbidden />;
    return <DetailsError onRetry={() => query.refetch()} />;
  }
  const detail = query.data;

  return (
    <article className="grid grid-cols-[60%_40%] min-h-[calc(100vh-56px)]">
      {/* LEFT */}
      <div className="p-8 overflow-auto space-y-6">
        <header className="space-y-3">
          <div className="flex items-center gap-3 text-xs font-mono text-fg-dim">
            <Link href="/" className="hover:text-fg flex items-center gap-1">
              <ArrowLeft className="size-3" aria-hidden="true" /> Calendar
            </Link>
            <span aria-hidden="true">·</span>
            <span>{detail.reference ?? detail.id}</span>
          </div>
          <div className="flex items-start gap-3">
            <h1 className="h1 flex-1">{detail.title}</h1>
            <Tabs value={mode} onValueChange={(v) => setMode(v as "view" | "edit")}>
              <TabsList>
                <TabsTrigger value="view">View</TabsTrigger>
                <TabsTrigger value="edit" disabled={!detail.actions.can_edit}>
                  Edit
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={detail.status} />
            <ImpactBadge impact={detail.impact} />
            <span className="text-xs text-fg-dim">Updated {formatDateTime(detail.updated_at)}</span>
          </div>
        </header>

        {mode === "edit" ? (
          <MaintenanceEditMode detail={detail} onClose={() => setMode("view")} />
        ) : (
          <div className="space-y-6">
            <Section label="Time">
              <div className="flex items-center gap-3">
                <span className="font-mono tabular-nums">
                  {formatRange(detail.planned_period.start, detail.planned_period.end)}
                </span>
                <span className="text-fg-dim">planned</span>
                {detail.actual_period ? (
                  <>
                    <Separator orientation="vertical" className="h-4" />
                    <span className="font-mono tabular-nums">
                      {formatRange(detail.actual_period.start, detail.actual_period.end)}
                    </span>
                    <span className="text-fg-dim">actual</span>
                  </>
                ) : null}
              </div>
            </Section>

            <Section label="Scope">
              <span className="capitalize">{detail.scope}</span>
            </Section>

            <Section label="Impact">
              <ImpactBadge impact={detail.impact} />
            </Section>

            <Section label="People">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                <span className="flex items-center gap-2">
                  <span className="text-fg-dim">Author</span>
                  <span>{detail.created_by ?? "Unknown user"}</span>
                </span>
                {detail.approver ? (
                  <span className="flex items-center gap-2">
                    <span className="text-fg-dim">Approver</span>
                    <span>{detail.approver}</span>
                  </span>
                ) : null}
              </div>
            </Section>

            <Section label="Resources">
              <div className="flex flex-wrap gap-1.5">
                {detail.resources.map((r) => (
                  <ResourceChip key={r.id} name={r.name} type={r.type} />
                ))}
              </div>
            </Section>

            {detail.description ? (
              <Section label="Description">
                <p className="text-fg leading-relaxed m-0">{detail.description}</p>
              </Section>
            ) : null}

            <Section label="Steps">
              <div>
                {detail.steps.length === 0 ? (
                  <p className="caption">No steps defined.</p>
                ) : (
                  detail.steps.map((s, i) => (
                    <StepRow
                      key={s.id}
                      number={s.order ?? i + 1}
                      title={s.title}
                      duration={s.duration}
                      state={s.status}
                    />
                  ))
                )}
              </div>
            </Section>
          </div>
        )}

        {mode === "view" ? (
          <ActionBar
            detail={detail}
            onCancel={() => setCancelOpen(true)}
            onEdit={() => setMode("edit")}
            onApprove={() =>
              actionMutation.mutate({
                id: detail.id,
                action: "approve",
                revision: detail.revision,
                conflicts: detail.conflicts,
              })
            }
            onStart={() => actionMutation.mutate({ id: detail.id, action: "start" })}
            onComplete={() => actionMutation.mutate({ id: detail.id, action: "complete" })}
            pending={actionMutation.isPending}
          />
        ) : null}
      </div>

      {/* RIGHT */}
      <aside className="p-7 bg-bg-elev-2 border-l border-border-subtle overflow-auto space-y-4">
        <header className="flex items-baseline gap-3">
          <h2 className="h2">Conflicts</h2>
          {detail.conflicts.length > 0 ? (
            <span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full bg-[var(--conflict-bg)] text-[var(--conflict-fg)] border border-[var(--conflict-border)] text-xs font-semibold tabular-nums">
              {detail.conflicts.length}
            </span>
          ) : null}
          <Link
            href={`/maintenance/${detail.id}/audit`}
            className="ml-auto text-xs text-fg-muted hover:text-fg flex items-center gap-1"
          >
            <History className="size-3" aria-hidden="true" /> Audit log
          </Link>
        </header>
        {detail.conflicts.length === 0 ? (
          <p className="caption">No overlapping maintenances detected.</p>
        ) : (
          <div className="space-y-3">
            {detail.conflicts.map((c) => (
              <ConflictCard
                key={c.maintenance_id}
                title={c.title}
                meta={formatRange(c.overlap_start, c.overlap_end)}
                details={
                  <>
                    <ConflictGridItem label="Maintenance" value={c.maintenance_id} mono />
                    <ConflictGridItem
                      label="Overlap"
                      value={formatRange(c.overlap_start, c.overlap_end)}
                      mono
                    />
                  </>
                }
                state={c.resolved ? "resolved" : "active"}
              />
            ))}
          </div>
        )}
      </aside>

      <CancelMaintenanceDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        maintenanceTitle={detail.title}
        pending={cancelMutation.isPending}
        onConfirm={(reason: CancelReason, comment: string) => {
          cancelMutation.mutate(
            { id: detail.id, reason, comment },
            { onSuccess: () => setCancelOpen(false) },
          );
        }}
      />
    </article>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim">{label}</div>
      <div className="text-sm text-fg">{children}</div>
    </section>
  );
}

function ActionBar({
  detail,
  onCancel,
  onEdit,
  onApprove,
  onStart,
  onComplete,
  pending,
}: {
  detail: {
    actions: {
      can_edit: boolean;
      can_cancel: boolean;
      can_approve: boolean;
      can_start: boolean;
      can_complete: boolean;
    };
  };
  onCancel: () => void;
  onEdit: () => void;
  onApprove: () => void;
  onStart: () => void;
  onComplete: () => void;
  pending: boolean;
}) {
  const a = detail.actions;
  return (
    <footer className="sticky bottom-0 -mx-8 px-8 py-3 mt-6 border-t border-border-subtle bg-bg-elev-1 flex items-center gap-2">
      {a.can_edit ? (
        <Button variant="outline" size="sm" onClick={onEdit} disabled={pending}>
          <Edit2 className="size-3.5" aria-hidden="true" /> Edit
        </Button>
      ) : null}
      {a.can_cancel ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={pending}
          className="text-[var(--destructive-fg)] hover:bg-[var(--destructive-bg)]"
        >
          <X className="size-3.5" aria-hidden="true" /> Cancel
        </Button>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        {a.can_approve ? (
          <Button size="sm" onClick={onApprove} disabled={pending}>
            <Check className="size-3.5" aria-hidden="true" /> Approve
          </Button>
        ) : null}
        {a.can_start ? (
          <Button size="sm" onClick={onStart} disabled={pending}>
            <PlayCircle className="size-3.5" aria-hidden="true" /> Start
          </Button>
        ) : null}
        {a.can_complete ? (
          <Button size="sm" onClick={onComplete} disabled={pending}>
            <Play className="size-3.5" aria-hidden="true" /> Complete
          </Button>
        ) : null}
        {!a.can_edit && !a.can_cancel && !a.can_approve && !a.can_start && !a.can_complete ? (
          <span className="caption inline-flex items-center gap-1">
            <CircleSlash className="size-3" aria-hidden="true" /> No actions available
          </span>
        ) : null}
      </div>
    </footer>
  );
}
