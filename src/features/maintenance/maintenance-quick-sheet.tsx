"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Play, PlayCircle } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/shared/ui/shadcn/sheet";
import { Button } from "@/shared/ui/shadcn/button";
import { Separator } from "@/shared/ui/shadcn/separator";
import { ImpactBadge } from "@/shared/ui/domain/impact-badge";
import { StatusBadge } from "@/shared/ui/domain/status-badge";
import { ResourceChip } from "@/shared/ui/domain/resource-chip";
import { ChannelChip } from "@/shared/ui/domain/channel-chip";
import { StepRow } from "@/shared/ui/domain/step-row";
import { ConflictRow } from "@/shared/ui/domain/conflict-row";
import { formatDuration, formatRange, formatUtc } from "@/shared/ui/lib/format";
import { cn } from "@/shared/ui/lib/cn";
import type { MaintenanceDetail } from "@/domain/maintenance/maintenance";
import { useMaintenanceDetailQuery } from "./queries/use-maintenance-detail-query";
import { useMaintenanceAction } from "./queries/use-maintenance-actions";
import { Skeleton } from "@/shared/ui/domain/skeleton";

export interface MaintenanceQuickSheetProps {
  maintenanceId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MaintenanceQuickSheet({ maintenanceId, open, onOpenChange }: MaintenanceQuickSheetProps) {
  // Only fetch while the sheet is mounted with an id; React Query caches
  // hits so re-opening the same id is instant.
  const query = useMaintenanceDetailQuery(maintenanceId ?? "");
  const detail = maintenanceId && query.data?.id === maintenanceId ? query.data : undefined;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-modal="true" className="sm:max-w-[560px] flex flex-col gap-0 p-0">
        {/* Radix requires a Dialog title for screen readers at all times. When
            there is no detail yet (loading/empty), render a visually-hidden
            title so the a11y contract holds without showing a placeholder. */}
        {!detail ? <SheetTitle className="sr-only">Maintenance details</SheetTitle> : null}
        <SheetDescription className="sr-only">
          Read-only maintenance preview with a link to full details.
        </SheetDescription>
        {!detail && maintenanceId && query.isPending ? (
          <div className="p-6 space-y-3">
            <Skeleton type="row" width="60%" />
            <Skeleton type="row" width="40%" />
            <Skeleton type="block" />
          </div>
        ) : null}
        {detail ? <QuickSheetBody detail={detail} /> : null}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Peek body grouped into the same 3 semantic cards as the full
 * `MaintenanceDetailsPage` (regroup 2026-06-11): Overview · Impact & targets ·
 * Plan. Conflicts sit ABOVE Plan as a standalone list — they outrank plan
 * detail in a quick scan.
 */
function QuickSheetBody({ detail }: { detail: MaintenanceDetail }) {
  const isGlobal = detail.scope === "global";
  return (
    <>
      <SheetHeader className="px-6 pt-6 pb-3 gap-2">
        <div className="flex items-center gap-2 text-xs font-mono text-fg-dim">
          {detail.reference ?? detail.id}
        </div>
        <SheetTitle className="h2">{detail.title}</SheetTitle>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={detail.status} />
          <ImpactBadge impact={detail.impact} />
        </div>
        {/* Single meta line: who scheduled it + when, per the contract. */}
        <div className="text-xs text-fg-dim">
          Scheduled by <span className="text-fg-muted">{detail.created_by ?? "Unknown user"}</span>
          {detail.created_at ? (
            <>
              {" · "}
              <span className="font-mono tabular-nums">{formatUtc(detail.created_at)}</span>
            </>
          ) : null}
        </div>
      </SheetHeader>
      <Separator />

      <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
        {/* ─── CARD 1 · OVERVIEW (time + approver) ─── */}
        <Card label="Overview">
          <Field label="Time">
            <span className="font-mono tabular-nums">
              {formatRange(detail.planned_period.start, detail.planned_period.end)}
            </span>
          </Field>
          <Field label="Approver">
            {detail.approver ? (
              <span className="font-mono">{detail.approver}</span>
            ) : (
              <span className="text-fg-dim">—</span>
            )}
          </Field>
        </Card>

        {/* ─── CARD 2 · IMPACT & TARGETS (scope/impact/resources/notify) ─── */}
        <Card label="Impact & targets">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Scope">
              <span className="capitalize">{detail.scope}</span>
            </Field>
            <Field label="Impact">
              <ImpactBadge impact={detail.impact} />
            </Field>
          </div>
          {!isGlobal && detail.resources.length > 0 ? (
            <Field label="Resources">
              <div className="flex flex-wrap gap-1.5">
                {detail.resources.map((r) => (
                  <ResourceChip key={r.id} name={r.name} type={r.type} />
                ))}
              </div>
            </Field>
          ) : null}
          {detail.notify_targets.length > 0 ? (
            <Field label="Notify channels">
              <div className="flex flex-wrap gap-1.5">
                {detail.notify_targets.map((c) => (
                  <ChannelChip key={c.id} name={c.name} transport={c.transport} />
                ))}
              </div>
            </Field>
          ) : null}
        </Card>

        {/* ─── CONFLICTS — standalone list, above Plan (priority over plan detail) ─── */}
        <section
          className={cn(
            "space-y-2",
            detail.conflicts.length > 0 && "border-l-[3px] border-[var(--conflict-fg)] pl-3 -ml-3",
          )}
        >
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim flex items-center gap-1.5">
            <span>Conflicts</span>
            {detail.conflicts.length > 0 ? (
              <span className="inline-flex items-center gap-1 text-[var(--conflict-fg)] normal-case font-medium tracking-normal">
                <AlertTriangle className="size-3" aria-hidden="true" />
                {detail.conflicts.length} blocking approval
              </span>
            ) : null}
          </div>
          {detail.conflicts.length > 0 ? (
            // Rows sit flush inside the section's single accent bar (no per-row
            // rail — that would double the stripe). Conflicts can repeat the
            // same maintenance_id, so key by index.
            <div className="flex flex-col">
              {detail.conflicts.map((c, i) => (
                <ConflictRow
                  key={`${c.maintenance_id}-${i}`}
                  flush
                  title={c.title}
                  meta={formatRange(c.overlap_start, c.overlap_end)}
                  resolved={c.resolved}
                />
              ))}
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[var(--status-completed-fg)] text-sm">
              <Check className="size-3.5" aria-hidden="true" /> No conflicts
            </span>
          )}
        </section>

        {/* ─── CARD 3 · PLAN (description + steps) ─── */}
        <Card label="Plan">
          {detail.description ? (
            <Field label="Description">
              <ClampedText text={detail.description} />
            </Field>
          ) : null}
          {detail.steps.length > 0 ? (
            <Field label="Steps">
              <div>
                {detail.steps.slice(0, 5).map((s, i) => (
                  <StepRow
                    key={s.id}
                    number={s.order ?? i + 1}
                    title={s.title}
                    duration={formatDuration(s.duration)}
                    state={s.status}
                  />
                ))}
              </div>
            </Field>
          ) : null}
        </Card>
      </div>

      <Separator />
      {/* Audit is intentionally NOT exposed in the peek (frozen decision) —
          it's reachable from the full details page header. Footer Variant A:
          the active primary quick-action (if any) + Open full view. */}
      <footer className="px-6 py-4 flex items-center gap-2">
        <Button asChild variant="outline" size="sm" className="ml-auto">
          <Link href={`/maintenance/${detail.id}`}>
            Open full view <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </Button>
        <PrimaryQuickAction detail={detail} />
      </footer>
    </>
  );
}

/**
 * The single primary action the maintenance currently offers, mirroring the
 * full-page action bar's precedence (approve → start → complete). Renders
 * nothing when no action flag is set. The peek only surfaces the primary — Edit
 * / Cancel stay on the full page.
 */
function PrimaryQuickAction({ detail }: { detail: MaintenanceDetail }) {
  const action = useMaintenanceAction();
  const a = detail.actions;
  const run = (type: "approve" | "start" | "complete") =>
    action.mutate(
      type === "approve"
        ? { id: detail.id, action: "approve", revision: detail.revision, conflicts: detail.conflicts }
        : { id: detail.id, action: type },
    );

  if (a.can_approve) {
    return (
      <Button size="sm" onClick={() => run("approve")} disabled={action.isPending}>
        <Check className="size-3.5" aria-hidden="true" /> Approve
      </Button>
    );
  }
  if (a.can_start) {
    return (
      <Button size="sm" onClick={() => run("start")} disabled={action.isPending}>
        <PlayCircle className="size-3.5" aria-hidden="true" /> Start
      </Button>
    );
  }
  if (a.can_complete) {
    return (
      <Button size="sm" onClick={() => run("complete")} disabled={action.isPending}>
        <Play className="size-3.5" aria-hidden="true" /> Complete maintenance
      </Button>
    );
  }
  return null;
}

/**
 * Description with a 3-line clamp + Read more / Show less toggle. Whether the
 * text overflows is measured in a layout effect against the *clamped* element
 * (re-run when the text changes), so the toggle stays stable while expanded —
 * a ref-callback measured on the expanded element would read no overflow and
 * make the collapse control vanish.
 */
function ClampedText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLParagraphElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [text]);

  // The project's `line-clamp-N` utility resolves to `display: flow-root` (not
  // `-webkit-box`) in this Tailwind build, so the clamp never engages. Set the
  // webkit-box properties explicitly via arbitrary utilities instead.
  const clampClass =
    "overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]";

  return (
    <div className="space-y-1">
      <p ref={ref} className={cn("text-fg leading-relaxed m-0", !expanded && clampClass)}>
        {text}
      </p>
      {overflows ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-accent-fg hover:underline"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Bordered semantic card grouping a set of fields under an uppercase label —
 * the peek mirror of the full page's `--bg-elev-2` + `--border` cards.
 */
function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elev-2 p-4 space-y-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim">{label}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim">{label}</div>
      <div className="text-sm text-fg">{children}</div>
    </div>
  );
}
