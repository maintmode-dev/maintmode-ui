"use client";

import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/shared/ui/shadcn/button";
import { AuditEmpty, AuditError, AuditLoading } from "@/shared/ui/states";
import { formatDateTime, formatRelative } from "@/shared/ui/lib/format";
import { cn } from "@/shared/ui/lib/cn";

import { useMaintenanceAuditQuery } from "./queries/use-audit-queries";
import { useMaintenanceDetailQuery } from "@/features/maintenance/queries/use-maintenance-detail-query";

export function MaintenanceAuditPage({ id }: { id: string }) {
  const detailQuery = useMaintenanceDetailQuery(id);
  const detail = detailQuery.data;
  const auditQuery = useMaintenanceAuditQuery(id);
  const events = useMemo(() => auditQuery.data ?? [], [auditQuery.data]);
  const status: "loading" | "error" | "empty" | "ready" = auditQuery.isPending
    ? "loading"
    : auditQuery.isError
      ? "error"
      : events.length === 0
        ? "empty"
        : "ready";

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  return (
    <div className="mx-auto max-w-[1200px] p-6 space-y-4">
      <header className="space-y-2">
        <Link
          href={`/maintenance/${id}`}
          className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="size-3" aria-hidden="true" /> Back to maintenance
        </Link>
        <h1 className="h1">Audit · {detail?.title ?? id}</h1>
        <p className="body-sm">Audit events recorded against this maintenance.</p>
      </header>

      {status === "loading" ? (
        <AuditLoading />
      ) : status === "error" ? (
        <AuditError onRetry={() => auditQuery.refetch()} />
      ) : status === "empty" ? (
        <AuditEmpty
          cta={
            <Button asChild variant="outline" size="sm">
              <Link href={`/maintenance/${id}`}>
                <ArrowLeft className="size-3" aria-hidden="true" /> Back to maintenance
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="bg-bg-elev-1 border border-border-subtle rounded-md overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-bg-elev-2 border-b border-border-subtle">
              <tr>
                {["When", "Actor", "Action", "Target", ""].map((h, i) => (
                  <th
                    key={i}
                    className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const open = expanded.has(e.id);
                return (
                  <>
                    <tr
                      key={e.id}
                      className={cn(
                        "border-b border-border-subtle last:border-b-0",
                        open && "bg-bg-elev-2/50",
                      )}
                    >
                      <td className="px-3 py-2 font-mono tabular-nums text-xs text-fg whitespace-nowrap">
                        <span title={formatDateTime(e.created_at)}>{formatRelative(e.created_at)}</span>
                      </td>
                      <td className="px-3 py-2">{e.actor}</td>
                      <td className="px-3 py-2 font-mono text-xs text-fg-muted">{e.action}</td>
                      <td className="px-3 py-2 text-fg-muted">{e.target_type ?? "—"}</td>
                      <td className="px-3 py-2 w-8">
                        {e.details ? (
                          <button
                            type="button"
                            aria-label={open ? "Collapse details" : "Expand details"}
                            onClick={() =>
                              setExpanded((prev) => {
                                const next = new Set(prev);
                                if (next.has(e.id)) next.delete(e.id);
                                else next.add(e.id);
                                return next;
                              })
                            }
                            className="text-fg-dim hover:text-fg"
                          >
                            {open ? (
                              <ChevronDown className="size-3.5" aria-hidden="true" />
                            ) : (
                              <ChevronRight className="size-3.5" aria-hidden="true" />
                            )}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {open && e.details ? (
                      <tr className="border-b border-border-subtle bg-bg-elev-2/40">
                        <td colSpan={5} className="px-6 py-3">
                          <pre className="text-xs font-mono text-fg-muted whitespace-pre-wrap">
                            {e.details}
                          </pre>
                        </td>
                      </tr>
                    ) : null}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
