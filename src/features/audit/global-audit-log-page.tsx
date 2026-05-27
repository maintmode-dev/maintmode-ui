"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/shared/ui/shadcn/input";
import { Chip } from "@/shared/ui/domain/chip";
import { Stack } from "@/shared/ui/domain/stack";
import { Skeleton } from "@/shared/ui/domain/skeleton";
import { AuditError } from "@/shared/ui/states";
import { formatDateTime, formatRelative } from "@/shared/ui/lib/format";

import { useGlobalAuditQuery } from "./queries/use-audit-queries";

const GROUPS = [
  { id: "all", label: "All" },
  { id: "auth", label: "Auth" },
  { id: "user", label: "Users" },
  { id: "maintenance", label: "Maintenance" },
  { id: "resource", label: "Resources" },
] as const;
type GroupId = (typeof GROUPS)[number]["id"];

export function GlobalAuditLogPage() {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<GroupId>("all");

  const auditQuery = useGlobalAuditQuery();
  const all = useMemo(() => auditQuery.data ?? [], [auditQuery.data]);

  const events = useMemo(() => {
    return all.filter((e) => {
      if (group !== "all" && !e.action.startsWith(`${group}.`)) return false;
      if (
        query &&
        !(
          (e.actor ?? "").toLowerCase().includes(query.toLowerCase()) ||
          (e.summary ?? "").toLowerCase().includes(query.toLowerCase()) ||
          e.action.toLowerCase().includes(query.toLowerCase())
        )
      )
        return false;
      return true;
    });
  }, [all, query, group]);

  return (
    <div className="mx-auto max-w-[1200px] p-6 space-y-4">
      <header className="space-y-1">
        <h1 className="h1">Audit log</h1>
        <p className="body-sm">
          Read-only global security log. Every state change and admin action is recorded.
        </p>
      </header>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[260px] max-w-[420px]">
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-fg-dim"
            aria-hidden="true"
          />
          <Input
            placeholder="Search actor, action, or summary"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {GROUPS.map((g) => (
            <button key={g.id} type="button" onClick={() => setGroup(g.id)} className="appearance-none">
              <Chip selected={group === g.id}>{g.label}</Chip>
            </button>
          ))}
        </div>
      </div>

      {auditQuery.isPending ? (
        <div className="space-y-2">
          <Skeleton type="row" width="40%" />
          <Skeleton type="block" />
          <Skeleton type="block" />
        </div>
      ) : auditQuery.isError ? (
        <AuditError onRetry={() => auditQuery.refetch()} />
      ) : events.length === 0 ? (
        <Stack
          icon={<Search aria-hidden="true" />}
          title="No events match"
          caption="Adjust the search or pick a different category."
        />
      ) : (
        <div className="bg-bg-elev-1 border border-border-subtle rounded-md overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-bg-elev-2 border-b border-border-subtle">
              <tr>
                {["When", "Actor", "Action", "Target", "Detail"].map((h, i) => (
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
              {events.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-border-subtle last:border-b-0 hover:bg-bg-row-hover"
                >
                  <td className="px-3 py-2.5 font-mono tabular-nums text-xs text-fg whitespace-nowrap">
                    <span title={formatDateTime(e.created_at)}>{formatRelative(e.created_at)}</span>
                  </td>
                  <td className="px-3 py-2.5">{e.actor}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-fg-muted">{e.action}</td>
                  <td className="px-3 py-2.5 text-fg-muted">{e.target_type}</td>
                  <td className="px-3 py-2.5">{e.summary ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
