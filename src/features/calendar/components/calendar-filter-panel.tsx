"use client";

import type { MaintenanceScope, MaintenanceStatus } from "@/domain/maintenance/models/maintenance";
import { MAINTENANCE_STATUS_LABEL } from "@/domain/maintenance/rules/status";
import { useResourcesQuery } from "@/features/resources/queries/use-resources-query";
import { Badge } from "@/shared/ui/primitives/badge";
import { Skeleton } from "@/shared/ui/primitives/skeleton";
import type { CalendarScopeFilter } from "@/features/calendar/lib/calendar-navigation";

type CalendarFilterPanelProps = {
  scope: CalendarScopeFilter;
  statuses: MaintenanceStatus[];
  resourceIds: string[];
  onScopeChange: (scope: CalendarScopeFilter) => void;
  onStatusesChange: (statuses: MaintenanceStatus[]) => void;
  onResourceIdsChange: (resourceIds: string[]) => void;
};

const SCOPE_OPTIONS: ReadonlyArray<{ value: CalendarScopeFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "global", label: "Global" },
  { value: "resource", label: "Resource" },
];

const STATUS_OPTIONS: readonly MaintenanceStatus[] = [
  "draft",
  "planned",
  "in_progress",
  "completed",
  "canceled",
];

export function CalendarFilterPanel({
  scope,
  statuses,
  resourceIds,
  onScopeChange,
  onStatusesChange,
  onResourceIdsChange,
}: CalendarFilterPanelProps) {
  const resourcesQuery = useResourcesQuery();
  const resources = resourcesQuery.data?.resources ?? [];

  const toggleStatus = (value: MaintenanceStatus) => {
    const next = statuses.includes(value)
      ? statuses.filter((entry) => entry !== value)
      : [...statuses, value];
    onStatusesChange(next);
  };

  const toggleResource = (id: string) => {
    const next = resourceIds.includes(id)
      ? resourceIds.filter((entry) => entry !== id)
      : [...resourceIds, id];
    onResourceIdsChange(next);
  };

  return (
    <div className="flex w-full flex-col gap-5 p-4">
      <section aria-labelledby="filter-scope-title" className="flex flex-col gap-2">
        <h3 id="filter-scope-title" className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Scope
        </h3>
        <div role="radiogroup" aria-labelledby="filter-scope-title" className="flex gap-2">
          {SCOPE_OPTIONS.map((option) => {
            const active = option.value === scope;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onScopeChange(option.value as MaintenanceScope | "all")}
                className={
                  "rounded-md border px-3 py-1 text-xs font-semibold transition " +
                  (active
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-strong)] hover:bg-[var(--surface-subtle)]")
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="filter-status-title" className="flex flex-col gap-2">
        <h3 id="filter-status-title" className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Status
        </h3>
        <div className="flex flex-col gap-1">
          {STATUS_OPTIONS.map((status) => {
            const active = statuses.includes(status);
            return (
              <label
                key={status}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-[var(--surface-subtle)]"
              >
                <span className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleStatus(status)}
                    aria-label={`Toggle ${MAINTENANCE_STATUS_LABEL[status]} filter`}
                  />
                  {MAINTENANCE_STATUS_LABEL[status]}
                </span>
                {active ? <Badge tone="info">on</Badge> : null}
              </label>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="filter-resources-title" className="flex flex-col gap-2">
        <h3
          id="filter-resources-title"
          className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"
        >
          Resources
        </h3>
        {resourcesQuery.isLoading ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        ) : resourcesQuery.isError ? (
          <p className="text-xs text-[var(--danger-fg)]" role="alert">
            Resources are unavailable.
          </p>
        ) : resources.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">No resources configured.</p>
        ) : (
          <ul className="flex max-h-64 flex-col gap-1 overflow-auto pr-1">
            {resources.map((resource) => {
              const active = resourceIds.includes(resource.id);
              return (
                <li key={resource.id}>
                  <label className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-[var(--surface-subtle)]">
                    <span className="flex flex-col text-sm">
                      <span>{resource.name}</span>
                      <span className="text-xs text-[var(--muted)]">{resource.type}</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => toggleResource(resource.id)}
                      aria-label={`Toggle ${resource.name} filter`}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
