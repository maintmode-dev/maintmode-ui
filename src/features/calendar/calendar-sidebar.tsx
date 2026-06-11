"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";

import { cn } from "@/shared/ui/lib/cn";
import { Input } from "@/shared/ui/shadcn/input";
import { STATUS_LABEL } from "@/shared/ui/domain/status-badge";
import { formatDate, formatRange } from "@/shared/ui/lib/format";
import type { Maintenance, MaintenanceStatus } from "@/domain/maintenance/maintenance";

import {
  resourceOptions,
  upcomingItems,
  STATUS_ORDER,
  type CalendarFilterState,
  type ScopeFilter,
} from "./calendar-filters";

/** Tailwind token classes for the active (filled) status chip, per status. */
const STATUS_CHIP_ON: Record<MaintenanceStatus, string> = {
  draft: "text-[var(--status-draft-fg)] bg-[var(--status-draft-bg)] border-[var(--status-draft-border)]",
  planned:
    "text-[var(--status-planned-fg)] bg-[var(--status-planned-bg)] border-[var(--status-planned-border)]",
  in_progress:
    "text-[var(--status-in_progress-fg)] bg-[var(--status-in_progress-bg)] border-[var(--status-in_progress-border)]",
  completed:
    "text-[var(--status-completed-fg)] bg-[var(--status-completed-bg)] border-[var(--status-completed-border)]",
  canceled:
    "text-[var(--status-canceled-fg)] bg-[var(--status-canceled-bg)] border-[var(--status-canceled-border)]",
};

const STATUS_DOT: Record<MaintenanceStatus, string> = {
  draft: "bg-[var(--status-draft-fg)]",
  planned: "bg-[var(--status-planned-fg)]",
  in_progress: "bg-[var(--status-in_progress-fg)]",
  completed: "bg-[var(--status-completed-fg)]",
  canceled: "bg-[var(--status-canceled-fg)]",
};

const SCOPE_OPTIONS: { value: ScopeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "global", label: "Global" },
  { value: "resource", label: "Per resource" },
];

export interface CalendarSidebarProps {
  /** The full (unfiltered) window of maintenances — drives resource options + Up next. */
  items: Maintenance[];
  filters: CalendarFilterState;
  onFiltersChange: (next: CalendarFilterState) => void;
  /** Live clock for the "today" helper + Up next ordering (passed from the page). */
  now: Date;
  onSelect: (id: string) => void;
}

export function CalendarSidebar({ items, filters, onFiltersChange, now, onSelect }: CalendarSidebarProps) {
  const [resourceQuery, setResourceQuery] = useState("");

  const allResources = useMemo(() => resourceOptions(items), [items]);
  const selectedResources = useMemo(
    () => allResources.filter((r) => filters.resourceIds.has(r.id)),
    [allResources, filters.resourceIds],
  );
  const resourceMatches = useMemo(() => {
    const q = resourceQuery.trim().toLowerCase();
    if (!q) return [];
    return allResources
      .filter((r) => !filters.resourceIds.has(r.id) && r.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [allResources, resourceQuery, filters.resourceIds]);

  const upNext = useMemo(() => upcomingItems(items, now), [items, now]);

  const toggleStatus = (status: MaintenanceStatus) => {
    const next = new Set(filters.statuses);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    onFiltersChange({ ...filters, statuses: next });
  };

  const setScope = (scope: ScopeFilter) => onFiltersChange({ ...filters, scope });

  const addResource = (id: string) => {
    const next = new Set(filters.resourceIds);
    next.add(id);
    onFiltersChange({ ...filters, resourceIds: next });
    setResourceQuery("");
  };
  const removeResource = (id: string) => {
    const next = new Set(filters.resourceIds);
    next.delete(id);
    onFiltersChange({ ...filters, resourceIds: next });
  };

  return (
    <aside className="space-y-5" aria-label="Calendar filters">
      {/* Status chips */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-dim">Status</h2>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_ORDER.map((status) => {
            const active = filters.statuses.has(status);
            return (
              <button
                key={status}
                type="button"
                onClick={() => toggleStatus(status)}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  active
                    ? STATUS_CHIP_ON[status]
                    : "border-border-subtle bg-transparent text-fg-dim hover:text-fg-muted hover:border-border",
                )}
              >
                <span
                  className={cn("size-1.5 rounded-full", active ? STATUS_DOT[status] : "bg-fg-dim")}
                  aria-hidden="true"
                />
                {STATUS_LABEL[status]}
              </button>
            );
          })}
        </div>
      </section>

      {/* Scope segmented control */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-dim">Scope</h2>
        <div
          role="radiogroup"
          aria-label="Scope"
          className="inline-flex w-full rounded-md border border-border-subtle bg-bg-elev-2 p-0.5"
        >
          {SCOPE_OPTIONS.map((opt) => {
            const active = filters.scope === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setScope(opt.value)}
                className={cn(
                  "flex-1 rounded-[5px] px-2 py-1 text-xs font-medium transition-colors",
                  active
                    ? "bg-bg-elev-4 text-fg-strong"
                    : "text-fg-muted hover:text-fg-strong hover:bg-bg-row-hover",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Resources */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-dim">Resources</h2>
        <div className="relative">
          <Input
            value={resourceQuery}
            onChange={(e) => setResourceQuery(e.target.value)}
            placeholder="Search resources…"
            className="h-8 text-xs"
            aria-label="Search resources"
          />
          {resourceMatches.length > 0 ? (
            <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-bg-elev-2 shadow-md">
              {resourceMatches.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => addResource(r.id)}
                    className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs text-fg hover:bg-bg-row-hover"
                  >
                    <span className="truncate">{r.name}</span>
                    {r.type ? <span className="shrink-0 text-[10px] text-fg-dim">{r.type}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {selectedResources.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {selectedResources.map((r) => (
              <span
                key={r.id}
                className="inline-flex items-center gap-1 rounded-full border border-border-subtle bg-bg-elev-2 py-1 pl-2.5 pr-1 text-xs text-fg"
              >
                <span className="max-w-[120px] truncate">{r.name}</span>
                <button
                  type="button"
                  onClick={() => removeResource(r.id)}
                  aria-label={`Remove ${r.name}`}
                  className="grid size-4 place-items-center rounded-full text-fg-dim hover:bg-bg-row-hover hover:text-fg"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        ) : allResources.length === 0 ? (
          <p className="text-xs text-fg-dim">No resources in view.</p>
        ) : null}
      </section>

      {/* Up next */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-dim">Up next</h2>
        <p className="text-xs text-fg-muted">
          Today · <span className="tabular-nums">{formatDate(now.toISOString())}</span>
        </p>
        {upNext.length === 0 ? (
          <p className="text-xs text-fg-dim">Nothing upcoming.</p>
        ) : (
          <ul className="space-y-1">
            {upNext.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onSelect(m.id)}
                  className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-bg-row-hover"
                >
                  <span className="relative mt-1 flex size-2 shrink-0 items-center justify-center">
                    {m.status === "in_progress" ? (
                      <span
                        className={cn(
                          "absolute inline-flex size-2 animate-ping rounded-full opacity-75",
                          STATUS_DOT[m.status],
                        )}
                        aria-hidden="true"
                      />
                    ) : null}
                    <span
                      className={cn("relative size-1.5 rounded-full", STATUS_DOT[m.status])}
                      aria-hidden="true"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-fg">{m.title}</span>
                    <span className="block font-mono text-[10px] tabular-nums text-fg-dim">
                      {formatRange(m.planned_period.start, m.planned_period.end)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
