"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";

import { cn } from "@/shared/ui/lib/cn";
import { Input } from "@/shared/ui/shadcn/input";
import { STATUS_LABEL } from "@/shared/ui/domain/status-badge";
import { formatDate, formatRange } from "@/shared/ui/lib/format";
import { useTimezone } from "@/features/_shared/timezone/use-timezone";
import { useNow } from "@/features/_shared/hooks/use-now";
import type { CalendarEvent, MaintenanceStatus } from "@/domain/maintenance/maintenance";

import { useDebouncedValue } from "@/features/_shared/hooks/use-debounced-value";
import { useResourcesQuery } from "@/features/resources/queries/use-resources-query";

import { upcomingItems, STATUS_ORDER, type CalendarFilterState, type ScopeFilter } from "./calendar-filters";

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

/** The states the resource picker's dropdown can be in, in precedence order. */
type ResourceStatus = "idle" | "pending" | "error" | "empty" | "ready";

/**
 * The line each non-`ready` state puts under the search box. `idle` and `ready`
 * render no message (a list, or nothing), but they are listed so adding a state
 * to `ResourceStatus` is a compile error here until its copy is decided —
 * "no such resource" standing in for a failed load is the exact bug RUK #55-#57
 * fixed in three other pickers.
 */
const RESOURCE_STATUS_MESSAGE: Record<ResourceStatus, string | null> = {
  idle: null,
  pending: "Searching…",
  error: "Couldn't load resources.",
  empty: "No resources found.",
  ready: null,
};

export interface CalendarSidebarProps {
  /** The server-filtered window (status + resource) — drives "Up next" only; the resource picker reads the catalogue. */
  items: CalendarEvent[];
  filters: CalendarFilterState;
  onFiltersChange: (next: CalendarFilterState) => void;
  onSelect: (id: string) => void;
}

export function CalendarSidebar({ items, filters, onFiltersChange, onSelect }: CalendarSidebarProps) {
  const [resourceQuery, setResourceQuery] = useState("");
  const { zone } = useTimezone();
  // The live clock is owned HERE, not passed down, because this is its only
  // consumer ("Today" below + `upcomingItems` ordering). Held in page state it
  // re-rendered the whole calendar once a minute — including the grid, which is
  // not `memo`ised and never reads the clock (RUK-265).
  const now = useNow();

  // The picker searches the CATALOGUE, not the loaded window (RUK-256).
  //
  // It used to build its options from `event.resources`, a field the calendar
  // endpoint has never sent — so the list was always empty and the filter could
  // not fire. Resources now come from `/api/resources`, which matches `name`
  // server-side, and the selection is applied server-side too.
  //
  // Consequence worth knowing: this offers every ACTIVE resource, not only ones
  // appearing in the visible window. The endpoint carries no usage data, so
  // narrowing it would be a backend ask.
  const debouncedQuery = useDebouncedValue(resourceQuery.trim(), 300);
  const catalogue = useResourcesQuery(
    { name: debouncedQuery, limit: 20 },
    // No search text, no request: an empty box means "nothing asked for yet",
    // so opening the calendar costs no catalogue call.
    { enabled: debouncedQuery.length > 0 },
  );

  // Chips render from the SELECTION, never from the catalogue result: that query
  // is keyed on the search text, so reading names from it would blank every chip
  // the moment the box is cleared.
  const selectedResources = Array.from(filters.resources, ([id, name]) => ({ id, name }));
  const resourceMatches = (catalogue.data?.resources ?? []).filter((r) => !filters.resources.has(r.id));

  // Four states, kept apart on purpose (RUK #55-#57 fixed this exact class of
  // bug in three other pickers): an idle box says nothing, a load in flight is
  // not a miss, and a FAILED load must never read as "no such resource".
  // Pending outranks error, so a retry in flight doesn't show a stale failure.
  const resourceStatus: ResourceStatus = !debouncedQuery
    ? "idle"
    : catalogue.isPending
      ? "pending"
      : catalogue.isError
        ? "error"
        : resourceMatches.length === 0
          ? "empty"
          : "ready";

  const upNext = useMemo(() => upcomingItems(items, now), [items, now]);

  // The single remaining active status can't be cleared: an empty set sends no
  // `statuses` param, which the backend reads as "all statuses" — so deselecting
  // everything would paradoxically show MORE, not an empty calendar. Keeping ≥1
  // active mirrors `readStoredFilters`, which likewise rejects an empty persisted
  // set. One derived predicate so the guard (toggleStatus) and the affordance
  // (disabled chip) can't drift.
  const isLastActiveStatus = (status: MaintenanceStatus) =>
    filters.statuses.has(status) && filters.statuses.size === 1;

  const toggleStatus = (status: MaintenanceStatus) => {
    if (isLastActiveStatus(status)) return;
    const next = new Set(filters.statuses);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    onFiltersChange({ ...filters, statuses: next });
  };

  const setScope = (scope: ScopeFilter) => onFiltersChange({ ...filters, scope });

  // The NAME travels with the id, captured at selection time: the catalogue
  // query is keyed on the search text, so clearing the box would otherwise leave
  // a selected chip with nothing to render (RUK-256).
  const addResource = (id: string, name: string) => {
    const next = new Map(filters.resources);
    next.set(id, name);
    onFiltersChange({ ...filters, resources: next });
    setResourceQuery("");
  };
  const removeResource = (id: string) => {
    const next = new Map(filters.resources);
    next.delete(id);
    onFiltersChange({ ...filters, resources: next });
  };

  return (
    <aside className="space-y-5" aria-label="Calendar filters">
      {/* Status chips */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-dim">Status</h2>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_ORDER.map((status) => {
            const active = filters.statuses.has(status);
            // Disable the last active chip so the no-clear rule is visible, not a
            // silent no-op click.
            const isLastActive = isLastActiveStatus(status);
            return (
              <button
                key={status}
                type="button"
                onClick={() => toggleStatus(status)}
                aria-pressed={active}
                disabled={isLastActive}
                title={isLastActive ? "At least one status must stay selected" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  active
                    ? STATUS_CHIP_ON[status]
                    : "border-border-subtle bg-transparent text-fg-dim hover:text-fg-muted hover:border-border",
                  isLastActive && "cursor-not-allowed opacity-60",
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
          {resourceStatus === "ready" ? (
            <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-bg-elev-2 shadow-md">
              {resourceMatches.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => addResource(r.id, r.name)}
                    className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs text-fg hover:bg-bg-row-hover"
                  >
                    <span className="truncate">{r.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : resourceStatus === "idle" ? null : (
            <p
              // A failed load is announced; a plain miss is not. `role="alert"`
              // rather than `status` because this is raised by an operator
              // action (typing), which is the case the repo reserves it for.
              {...(resourceStatus === "error" ? { role: "alert" as const } : {})}
              className="absolute z-20 mt-1 w-full rounded-md border border-border bg-bg-elev-2 px-2.5 py-1.5 text-xs text-fg-dim shadow-md"
            >
              {RESOURCE_STATUS_MESSAGE[resourceStatus]}
            </p>
          )}
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
        ) : null}
      </section>

      {/* Up next */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-dim">Up next</h2>
        <p className="text-xs text-fg-muted">
          Today · <span className="tabular-nums">{formatDate(now.toISOString(), zone)}</span>
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
                      {formatRange(m.planned_period.start, m.planned_period.end, zone)}
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
