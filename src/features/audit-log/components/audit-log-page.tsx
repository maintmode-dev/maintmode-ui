"use client";

import { useState } from "react";

import { BffError } from "@/features/_shared/api/bff-error";
import { useAuditLogQuery } from "@/features/audit-log/queries/use-audit-log-query";
import { AuditLogFiltersForm } from "@/features/audit-log/components/audit-log-filters";
import { AuditLogTable } from "@/features/audit-log/components/audit-log-table";
import { AuditLogPagination } from "@/features/audit-log/components/audit-log-pagination";
import type { AuditLogFilters } from "@/features/audit-log/schemas/audit-filter-schema";
import { EmptyState, ErrorState, ForbiddenState, LoadingState } from "@/shared/ui/primitives/state";

const DEFAULT_FILTERS: AuditLogFilters = {
  limit: 50,
  offset: 0,
  action: undefined,
  actor: undefined,
  createdFrom: undefined,
  createdTo: undefined,
};

export function AuditLogPage() {
  const [filters, setFilters] = useState<AuditLogFilters>(DEFAULT_FILTERS);
  const query = useAuditLogQuery(filters);

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Audit log</h1>
        <p className="text-sm text-[var(--muted)]">
          Sign-in events and role changes ordered newest first. Pagination is capped at 100 entries
          per page.
        </p>
      </header>

      <AuditLogFiltersForm value={filters} onApply={setFilters} />

      <Body query={query} filters={filters} setFilters={setFilters} />
    </section>
  );
}

function Body({
  query,
  filters,
  setFilters,
}: {
  query: ReturnType<typeof useAuditLogQuery>;
  filters: AuditLogFilters;
  setFilters: (filters: AuditLogFilters) => void;
}) {
  if (query.isPending && !query.data) {
    return <LoadingState title="Loading audit log">Fetching audit entries.</LoadingState>;
  }

  if (query.isError) {
    const error = query.error;
    if (error instanceof BffError && error.code === "FORBIDDEN") {
      return <ForbiddenState />;
    }
    return (
      <ErrorState title="Couldn’t load audit log">
        {error instanceof Error ? error.message : "Unknown error while loading audit log."}
      </ErrorState>
    );
  }

  const logs = query.data?.logs ?? [];
  if (logs.length === 0) {
    return (
      <EmptyState title="No audit entries">
        No audit log entries match these filters.
      </EmptyState>
    );
  }

  const isLastPage = logs.length < filters.limit;

  return (
    <div className="flex flex-col gap-3">
      <AuditLogTable entries={logs} />
      <AuditLogPagination
        offset={filters.offset}
        limit={filters.limit}
        isLastPage={isLastPage}
        onChange={(nextOffset) => setFilters({ ...filters, offset: nextOffset })}
        isLoading={query.isFetching}
      />
    </div>
  );
}
