"use client";

import { Button } from "@/shared/ui/primitives/button";

export type AuditLogPaginationProps = {
  offset: number;
  limit: number;
  isLastPage: boolean;
  onChange: (nextOffset: number) => void;
  isLoading: boolean;
};

export function AuditLogPagination({
  offset,
  limit,
  isLastPage,
  onChange,
  isLoading,
}: AuditLogPaginationProps) {
  const start = offset + 1;
  const end = offset + limit;
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
      data-testid="audit-log-pagination"
    >
      <span className="text-[var(--muted)]">
        Showing {start}–{end}
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onChange(Math.max(0, offset - limit))}
          disabled={offset === 0 || isLoading}
          data-testid="audit-log-prev"
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onChange(offset + limit)}
          disabled={isLastPage || isLoading}
          data-testid="audit-log-next"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
