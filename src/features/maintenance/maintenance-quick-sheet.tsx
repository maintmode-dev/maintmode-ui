"use client";

import Link from "next/link";
import { ArrowRight, History } from "lucide-react";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/ui/shadcn/sheet";
import { Button } from "@/shared/ui/shadcn/button";
import { Separator } from "@/shared/ui/shadcn/separator";
import { ImpactBadge } from "@/shared/ui/domain/impact-badge";
import { StatusBadge } from "@/shared/ui/domain/status-badge";
import { ResourceChip } from "@/shared/ui/domain/resource-chip";
import { StepRow } from "@/shared/ui/domain/step-row";
import { ConflictRow } from "@/shared/ui/domain/conflict-row";
import { formatRange, formatRelative } from "@/shared/ui/lib/format";
import { useMaintenanceDetailQuery } from "./queries/use-maintenance-detail-query";
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
      <SheetContent className="sm:max-w-[480px] flex flex-col gap-0 p-0">
        {!detail && maintenanceId && query.isPending ? (
          <div className="p-6 space-y-3">
            <Skeleton type="row" width="60%" />
            <Skeleton type="row" width="40%" />
            <Skeleton type="block" />
          </div>
        ) : null}
        {detail ? (
          <>
            <SheetHeader className="px-6 pt-6 pb-3 gap-2">
              <div className="flex items-center gap-2 text-xs font-mono text-fg-dim">
                {detail.reference ?? detail.id}
                <span aria-hidden="true">·</span>
                <span>{formatRelative(detail.updated_at)}</span>
              </div>
              <SheetTitle className="h2">{detail.title}</SheetTitle>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={detail.status} />
                <ImpactBadge impact={detail.impact} />
              </div>
            </SheetHeader>
            <Separator />
            <div className="flex-1 overflow-auto px-6 py-4 space-y-5">
              <Field label="Planned window">
                <span className="font-mono tabular-nums">
                  {formatRange(detail.planned_period.start, detail.planned_period.end)}
                </span>
              </Field>
              {detail.description ? (
                <Field label="Description">
                  <p className="text-fg leading-relaxed m-0">{detail.description}</p>
                </Field>
              ) : null}
              <Field label="Resources">
                <div className="flex flex-wrap gap-1.5">
                  {detail.resources.map((r) => (
                    <ResourceChip key={r.id} name={r.name} type={r.type} />
                  ))}
                </div>
              </Field>
              {detail.steps.length > 0 ? (
                <Field label="Steps">
                  <div>
                    {detail.steps.slice(0, 5).map((s, i) => (
                      <StepRow
                        key={s.id}
                        number={s.order ?? i + 1}
                        title={s.title}
                        duration={s.duration}
                        state={s.status}
                      />
                    ))}
                  </div>
                </Field>
              ) : null}
              {detail.conflicts.length > 0 ? (
                <Field label="Conflicts">
                  <div className="space-y-2">
                    {detail.conflicts.map((c) => (
                      <ConflictRow
                        key={c.maintenance_id}
                        title={c.title}
                        meta={formatRange(c.overlap_start, c.overlap_end)}
                        resolved={c.resolved}
                      />
                    ))}
                  </div>
                </Field>
              ) : null}
            </div>
            <Separator />
            <footer className="px-6 py-4 flex items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/maintenance/${detail.id}/audit`}>
                  <History className="size-3.5" aria-hidden="true" /> Audit
                </Link>
              </Button>
              <Button size="sm" asChild className="ml-auto">
                <Link href={`/maintenance/${detail.id}`}>
                  Open details <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              </Button>
            </footer>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
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
