"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleSlash,
  Edit2,
  History,
  Play,
  PlayCircle,
  Power,
  X,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/ui/shadcn/button";
import { Separator } from "@/shared/ui/shadcn/separator";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/shadcn/tabs";
import { StatusBadge } from "@/shared/ui/domain/status-badge";
import { ImpactBadge } from "@/shared/ui/domain/impact-badge";
import { ResourceChip } from "@/shared/ui/domain/resource-chip";
import { ChannelChip } from "@/shared/ui/domain/channel-chip";
import { StepRow } from "@/shared/ui/domain/step-row";
import { ConflictCard, ConflictGridItem } from "@/shared/ui/domain/conflict-card";
import { DetailsError, DetailsForbidden, DetailsLoading, DetailsNotFound } from "@/shared/ui/states";
import { formatRange, formatDuration, formatUtc } from "@/shared/ui/lib/format";
import { cn } from "@/shared/ui/lib/cn";
import { BffError } from "@/features/_shared/api/bff-fetch";

import { CancelMaintenanceDialog } from "./cancel-maintenance-dialog";
import { MaintenanceQuickSheet } from "./maintenance-quick-sheet";
import { MaintenanceEditMode } from "./maintenance-edit-mode";
import { useMaintenanceDetailQuery } from "./queries/use-maintenance-detail-query";
import { useCancelMaintenance, useMaintenanceAction } from "./queries/use-maintenance-actions";
import { useStepAction } from "./queries/use-step-actions";
import type { CancelReason, MaintenanceDetail } from "@/domain/maintenance/maintenance";

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
  const stepMutation = useStepAction();

  const [mode, setMode] = useState<"view" | "edit">("view");
  const [cancelOpen, setCancelOpen] = useState(false);
  // A clicked conflict opens the conflicting maintenance in the quick-sheet
  // peek (not a full-page navigation).
  const [conflictPeekId, setConflictPeekId] = useState<string | null>(null);

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
            <Link
              href={`/maintenance/${detail.id}/audit`}
              className="ml-auto flex items-center gap-1 hover:text-fg"
            >
              <History className="size-3" aria-hidden="true" /> View history →
            </Link>
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
            <span className="font-mono tabular-nums text-xs text-fg-dim">
              Updated {formatUtc(detail.updated_at)}
            </span>
          </div>
        </header>

        {mode === "edit" ? (
          <MaintenanceEditMode detail={detail} onClose={() => setMode("view")} />
        ) : (
          <div className="space-y-4">
            {/* Fields grouped into 3 semantic cards (regroup 2026-06-11):
                Overview (when + who-acts) · Impact & targets (scope/impact/
                resources/notify) · Plan (description + steps). Author moved to
                the Metadata block below; Approver — the active lifecycle role —
                lives in Overview. */}

            {/* ── CARD 1 · OVERVIEW (time + approver) ── */}
            <Card label="Overview">
              <div className="grid grid-cols-2 gap-4">
                <Section label="Time" className="col-span-2">
                  <div className="flex flex-wrap items-center gap-3">
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
                <Section label="Approver">
                  {detail.approver ? (
                    <span className="font-mono">{detail.approver}</span>
                  ) : (
                    <span className="text-fg-dim">—</span>
                  )}
                </Section>
              </div>
            </Card>

            {/* ── CARD 2 · IMPACT & TARGETS ── */}
            <Card label="Impact & targets">
              <div className="grid grid-cols-2 gap-4">
                <Section label="Scope">
                  <span className="capitalize">{detail.scope}</span>
                </Section>
                <Section label="Impact">
                  <ImpactBadge impact={detail.impact} />
                </Section>
                {detail.scope !== "global" ? (
                  <Section label="Resources" className="col-span-2">
                    {detail.resources.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {detail.resources.map((r) => (
                          <ResourceChip key={r.id} name={r.name} type={r.type} />
                        ))}
                      </div>
                    ) : (
                      <span className="text-fg-dim">—</span>
                    )}
                  </Section>
                ) : null}
                <Section label="Notify channels" className="col-span-2">
                  {detail.notify_targets.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {detail.notify_targets.map((c) => (
                        <ChannelChip key={c.id} name={c.name} transport={c.transport} />
                      ))}
                    </div>
                  ) : (
                    <span className="text-fg-dim">—</span>
                  )}
                </Section>
              </div>
            </Card>

            {/* ── CARD 3 · PLAN (description + steps) ── */}
            <Card label="Plan">
              {detail.description ? (
                <Section label="Description">
                  <p className="text-fg leading-relaxed m-0">{detail.description}</p>
                </Section>
              ) : null}
              <Section label={`Steps · ${detail.steps.length}`}>
                <StepsView
                  detail={detail}
                  pending={stepMutation.isPending}
                  onStepAction={(stepId, action) =>
                    stepMutation.mutate({ maintenanceId: detail.id, stepId, action })
                  }
                />
              </Section>
            </Card>

            {/* METADATA — collapsed note below the cards. Carries Author
                (created_by) + rev + created_at. Snapshot id isn't on the read
                payload, so it's omitted rather than faked. */}
            <MetadataBlock detail={detail} />
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
        </header>
        {mode === "edit" ? (
          // No conflict-preview endpoint in MVP: dim the panel and tell the
          // operator conflicts are recomputed when the edit is saved.
          <p className="caption opacity-60">Conflicts will be recalculated after save.</p>
        ) : detail.conflicts.length === 0 ? (
          <p className="caption">No overlapping maintenances detected.</p>
        ) : (
          <div className="space-y-3">
            {detail.conflicts.map((c) => (
              <ConflictCard
                key={c.maintenance_id}
                onClick={() => setConflictPeekId(c.maintenance_id)}
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
        maintenanceRef={detail.reference ?? detail.id}
        maintenanceStatus={detail.status}
        pending={cancelMutation.isPending}
        onConfirm={(reason: CancelReason, comment: string) => {
          cancelMutation.mutate(
            { id: detail.id, reason, comment },
            { onSuccess: () => setCancelOpen(false) },
          );
        }}
      />

      <MaintenanceQuickSheet
        maintenanceId={conflictPeekId}
        open={conflictPeekId !== null}
        onOpenChange={(o) => !o && setConflictPeekId(null)}
      />
    </article>
  );
}

function Section({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2", className)}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim">{label}</div>
      <div className="text-sm text-fg">{children}</div>
    </section>
  );
}

/**
 * Bordered semantic card grouping a set of fields under an uppercase label.
 * `--bg-elev-2` + `--border` + `--radius-lg`, per the regroup contract.
 */
function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elev-2 p-5 space-y-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim">{label}</div>
      {children}
    </div>
  );
}

/**
 * Collapsed METADATA note below the cards. Author (created_by) + rev +
 * created_at — passive record-metadata, moved out of the body. Snapshot id is
 * not exposed on the read payload, so it's omitted (not faked).
 */
function MetadataBlock({ detail }: { detail: MaintenanceDetail }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim hover:text-fg"
      >
        <ChevronDown
          className={cn("size-3 transition-transform", !open && "-rotate-90")}
          aria-hidden="true"
        />
        Metadata
      </button>
      {open ? (
        <div className="mt-2 text-xs text-fg-muted leading-relaxed">
          author <span className="font-mono">{detail.created_by ?? "Unknown user"}</span>
          {detail.revision != null ? (
            <>
              {" · "}rev <span className="font-mono">{detail.revision}</span>
            </>
          ) : null}
          <br />
          created <span className="font-mono tabular-nums">{formatUtc(detail.created_at)}</span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Steps list for the details page. Every step is click-to-expand in ANY status
 * (regroup 2026-06-11) so the rollback plan is readable before the maintenance
 * starts. While the maintenance is in_progress the running step (in_progress)
 * is auto-expanded and carries its Complete/Cancel runtime controls; the next
 * pending step carries a Start control. Steps run in order, so only the first
 * pending step is startable — and only when no step is currently running.
 *
 * Exported for component tests (step-lifecycle controls / TC-STEP-01).
 */
export function StepsView({
  detail,
  pending,
  onStepAction,
}: {
  detail: MaintenanceDetail;
  pending: boolean;
  onStepAction: (stepId: string, action: "start" | "complete" | "cancel") => void;
}) {
  const runningIdx = detail.steps.findIndex((s) => s.status === "in_progress");
  // The next startable step: the first pending step, but only while the
  // maintenance is in_progress and nothing else is running (the backend rejects
  // out-of-order / concurrent starts with 400/409, surfaced as a toast).
  const nextStartableIdx =
    detail.status === "in_progress" && runningIdx < 0
      ? detail.steps.findIndex((s) => s.status === "pending")
      : -1;
  // Auto-expand the step that needs attention: the running one if any, else the
  // next pending step (so its Start control is visible without hunting).
  const focusIdx = runningIdx >= 0 ? runningIdx : nextStartableIdx;
  const [openIdx, setOpenIdx] = useState<number | null>(focusIdx >= 0 ? focusIdx : null);
  // Re-seed the open step to the focused one when it changes (e.g. after a step
  // completes and the next becomes startable, or is started) — adjusted during
  // render, not in an effect, so the focused step stays expanded without a
  // cascade.
  const [seenFocusIdx, setSeenFocusIdx] = useState(focusIdx);
  if (focusIdx !== seenFocusIdx) {
    setSeenFocusIdx(focusIdx);
    setOpenIdx(focusIdx >= 0 ? focusIdx : null);
  }

  if (detail.steps.length === 0) return <p className="caption">No steps defined.</p>;

  return (
    <div>
      {detail.steps.map((s, i) => {
        const isOpen = openIdx === i;
        const isRunning = s.status === "in_progress";
        const isNextStartable = i === nextStartableIdx;
        const rollback = s.rollback_description?.trim() || undefined;
        return (
          <StepRow
            key={s.id}
            number={s.order ?? i + 1}
            title={s.title}
            duration={formatDuration(s.duration)}
            state={s.status}
            onClick={() => setOpenIdx(isOpen ? null : i)}
            rollback={
              isOpen ? (
                <span className="space-y-2 block">
                  <span className="block">{rollback ?? "No rollback plan recorded."}</span>
                  {isRunning && detail.status === "in_progress" ? (
                    <span className="flex items-center gap-1.5 pt-1">
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => onStepAction(s.id, "complete")}
                        disabled={pending}
                      >
                        <Check className="size-3" aria-hidden="true" /> Complete
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => onStepAction(s.id, "cancel")}
                        disabled={pending}
                        className="text-[var(--destructive-fg)] hover:bg-[var(--destructive-bg)]"
                      >
                        <X className="size-3" aria-hidden="true" /> Skip
                      </Button>
                    </span>
                  ) : isNextStartable ? (
                    <span className="flex items-center gap-1.5 pt-1">
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => onStepAction(s.id, "start")}
                        disabled={pending}
                      >
                        <Power className="size-3" aria-hidden="true" /> Start step
                      </Button>
                    </span>
                  ) : null}
                </span>
              ) : undefined
            }
          />
        );
      })}
    </div>
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
    status: string;
    steps: { status: string }[];
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
  // The maintenance can't complete while any step is non-terminal — the backend
  // gates `can_complete` on it. Explain the stuck Complete so the operator knows
  // to finish the steps above (the per-step controls in the Steps section).
  const completeBlockedBySteps =
    detail.status === "in_progress" &&
    !a.can_complete &&
    detail.steps.some((s) => s.status === "pending" || s.status === "in_progress");
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
          <X className="size-3.5" aria-hidden="true" /> Cancel maintenance
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
            <Play className="size-3.5" aria-hidden="true" /> Complete maintenance
          </Button>
        ) : completeBlockedBySteps ? (
          <span className="caption inline-flex items-center gap-1">
            <CircleSlash className="size-3" aria-hidden="true" /> Finish all steps to complete this
            maintenance
          </span>
        ) : null}
        {!a.can_edit &&
        !a.can_cancel &&
        !a.can_approve &&
        !a.can_start &&
        !a.can_complete &&
        !completeBlockedBySteps ? (
          <span className="caption inline-flex items-center gap-1">
            <CircleSlash className="size-3" aria-hidden="true" /> No actions available
          </span>
        ) : null}
      </div>
    </footer>
  );
}
