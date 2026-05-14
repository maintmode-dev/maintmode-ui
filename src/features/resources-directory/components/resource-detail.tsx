"use client";

import { BffError } from "@/features/_shared/api/bff-error";
import { useResourceDetailQuery } from "@/features/resources-directory/queries/use-resource-detail-query";
import { useResourceTypesQuery } from "@/features/resources-directory/queries/use-resource-types-query";
import { Badge } from "@/shared/ui/primitives/badge";
import { EmptyState, ErrorState, ForbiddenState, LoadingState } from "@/shared/ui/primitives/state";

export type ResourceDetailProps = {
  id: string;
};

export function ResourceDetail({ id }: ResourceDetailProps) {
  const detail = useResourceDetailQuery(id);
  const types = useResourceTypesQuery(id);

  if (detail.isPending) {
    return <LoadingState title="Loading resource">Fetching resource details.</LoadingState>;
  }

  if (detail.isError) {
    const error = detail.error;
    if (error instanceof BffError && error.code === "FORBIDDEN") {
      return <ForbiddenState />;
    }
    if (error instanceof BffError && error.code === "NOT_FOUND") {
      return (
        <EmptyState title="Resource not found">
          No resource with this id exists in the directory.
        </EmptyState>
      );
    }
    return (
      <ErrorState title="Couldn’t load resource">
        {error instanceof Error ? error.message : "Unknown error while loading resource."}
      </ErrorState>
    );
  }

  const resource = detail.data?.resource;
  if (!resource) {
    return <EmptyState title="Resource not found">No data returned by the backend.</EmptyState>;
  }

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold" data-testid="resource-detail-name">
          {resource.name}
        </h1>
        {resource.description ? (
          <p className="text-sm text-[var(--muted)]">{resource.description}</p>
        ) : null}
      </header>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Row label="ID" value={resource.id} mono />
        <Row label="External ID" value={resource.externalId ?? "—"} mono={Boolean(resource.externalId)} />
        <Row label="Created" value={formatDate(resource.createdAt)} />
        <Row label="Updated" value={resource.updatedAt ? formatDate(resource.updatedAt) : "—"} />
      </dl>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Types</h2>
        <TypesBlock types={types} />
      </section>
    </article>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</dt>
      <dd className={mono ? "font-mono text-sm text-[var(--foreground)]" : "text-sm text-[var(--foreground)]"}>{value}</dd>
    </div>
  );
}

function TypesBlock({ types }: { types: ReturnType<typeof useResourceTypesQuery> }) {
  if (types.isPending) {
    return (
      <LoadingState title="Loading types">Fetching resource types.</LoadingState>
    );
  }
  if (types.isError) {
    const error = types.error;
    if (error instanceof BffError && error.code === "FORBIDDEN") {
      return <ForbiddenState />;
    }
    return (
      <ErrorState title="Couldn’t load types">
        {error instanceof Error ? error.message : "Unknown error while loading resource types."}
      </ErrorState>
    );
  }
  const list = types.data?.types ?? [];
  if (list.length === 0) {
    return (
      <EmptyState title="No types assigned">
        This resource has no types assigned in the backend.
      </EmptyState>
    );
  }
  return (
    <ul className="flex flex-wrap gap-2" data-testid="resource-detail-types">
      {list.map((type) => (
        <li key={type}>
          <Badge tone="info">{type}</Badge>
        </li>
      ))}
    </ul>
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
