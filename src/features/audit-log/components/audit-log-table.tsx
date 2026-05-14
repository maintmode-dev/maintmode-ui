"use client";

import { useState } from "react";

import type { AuditLogEntry } from "@/domain/audit/models/audit-log";
import { Badge } from "@/shared/ui/primitives/badge";
import { Button } from "@/shared/ui/primitives/button";

export type AuditLogTableProps = {
  entries: AuditLogEntry[];
};

const DESTRUCTIVE_ACTIONS = new Set(["revoked", "replaced", "login_failed"]);

export function AuditLogTable({ entries }: AuditLogTableProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <table className="min-w-full text-sm" data-testid="audit-log-table">
        <thead className="bg-[var(--surface-subtle)] text-left text-xs uppercase tracking-wide text-[var(--muted)]">
          <tr>
            <th className="px-3 py-2">When</th>
            <th className="px-3 py-2">Action</th>
            <th className="px-3 py-2">Actor</th>
            <th className="px-3 py-2">Entity</th>
            <th className="px-3 py-2">Target</th>
            <th className="px-3 py-2">Details</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const isOpen = expanded[entry.id] ?? false;
            return (
              <tr key={entry.id} className="border-t border-[var(--border)] align-top">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-[var(--muted)]">
                  {formatDate(entry.createdAt)}
                </td>
                <td className="px-3 py-2">
                  <Badge tone={DESTRUCTIVE_ACTIONS.has(entry.action) ? "danger" : "info"}>
                    {entry.action}
                  </Badge>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{entry.actor}</td>
                <td className="px-3 py-2 text-xs">
                  {entry.entityType ? (
                    <>
                      <span className="text-[var(--muted)]">{entry.entityType}</span>{" "}
                      <span className="font-mono">{entry.entityId ?? "—"}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  {entry.targetType ? (
                    <>
                      <span className="text-[var(--muted)]">{entry.targetType}</span>{" "}
                      <span className="font-mono">{entry.targetId ?? "—"}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  {entry.details ? (
                    <div className="flex flex-col gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpanded((prev) => ({ ...prev, [entry.id]: !isOpen }))}
                        aria-expanded={isOpen}
                        data-testid={`audit-log-toggle-${entry.id}`}
                      >
                        {isOpen ? "Hide" : "Show"} details
                      </Button>
                      {isOpen ? (
                        <pre className="whitespace-pre-wrap break-all rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] p-2 font-mono text-xs">
                          {entry.details}
                        </pre>
                      ) : null}
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return iso;
    }
    return date.toLocaleString();
  } catch {
    return iso;
  }
}
