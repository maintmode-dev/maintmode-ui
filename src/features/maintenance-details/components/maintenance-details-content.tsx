"use client";

import { format, parseISO } from "date-fns";

import type { MaintenanceStatus, MaintenanceSummary } from "@/domain/maintenance/models/maintenance";
import { MAINTENANCE_STATUS_LABEL } from "@/domain/maintenance/rules/status";
import { Badge } from "@/shared/ui/primitives/badge";

const STATUS_TONE: Record<MaintenanceStatus, "info" | "warning" | "success" | "danger" | "neutral"> = {
  draft: "neutral",
  planned: "info",
  in_progress: "warning",
  completed: "success",
  canceled: "danger",
};

type MaintenanceDetailsContentProps = {
  data: MaintenanceSummary;
};

export function MaintenanceDetailsContent({ data }: MaintenanceDetailsContentProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <Badge tone={STATUS_TONE[data.status] ?? "neutral"}>
            {MAINTENANCE_STATUS_LABEL[data.status]}
          </Badge>
          {data.has_conflict ? <Badge tone="danger">Conflict</Badge> : null}
        </div>
        <h2 className="text-lg font-semibold leading-tight">{data.title}</h2>
        <p className="text-sm text-[var(--muted)]">{data.description}</p>
      </div>

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
        {data.steps && data.steps.length > 0 ? (
          <DetailRow label="Steps">
            <ol className="flex flex-col gap-1 text-xs">
              {data.steps.map((step) => (
                <li key={`${step.order}-${step.id ?? "n"}`} className="flex gap-2">
                  <span className="font-semibold">#{step.order}</span>
                  <span className="text-[var(--foreground)]">{step.description}</span>
                  <span className="text-[var(--muted)]">({step.duration_minutes}m)</span>
                </li>
              ))}
            </ol>
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
