"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BffError } from "@/features/_shared/api/bff-error";
import { useResourceDirectoryQuery } from "@/features/resources-directory/queries/use-resource-directory-query";
import { Input } from "@/shared/ui/primitives/input";
import { EmptyState, ErrorState, ForbiddenState, LoadingState } from "@/shared/ui/primitives/state";
import { Button } from "@/shared/ui/primitives/button";

export type ResourceDirectoryListProps = {
  canCreate: boolean;
};

export function ResourceDirectoryList({ canCreate }: ResourceDirectoryListProps) {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 250);
  const query = useResourceDirectoryQuery(debounced);

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">Resources</h1>
          <p className="text-sm text-[var(--muted)]">
            Browse the maintmode resource directory. Use search to filter by name.
          </p>
        </div>
        {canCreate ? (
          <Link href="/resources/new">
            <Button variant="primary" size="sm" data-testid="resource-directory-create">
              New resource
            </Button>
          </Link>
        ) : null}
      </header>

      <div className="max-w-md">
        <Input
          type="search"
          placeholder="Search resources by name…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search resources"
          data-testid="resource-directory-search"
        />
      </div>

      <Body query={query} />
    </section>
  );
}

function Body({ query }: { query: ReturnType<typeof useResourceDirectoryQuery> }) {
  if (query.isPending) {
    return (
      <LoadingState title="Loading resources">
        Fetching the resource directory from the backend.
      </LoadingState>
    );
  }

  if (query.isError) {
    const error = query.error;
    if (error instanceof BffError && error.code === "FORBIDDEN") {
      return <ForbiddenState />;
    }
    return (
      <ErrorState title="Couldn’t load resources">
        {error instanceof Error ? error.message : "Unknown error while loading resources."}
      </ErrorState>
    );
  }

  const resources = query.data?.resources ?? [];
  if (resources.length === 0) {
    return (
      <EmptyState title="No resources found">
        The backend returned an empty resource list. Try a different search or create a new resource.
      </EmptyState>
    );
  }

  return (
    <ul
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      data-testid="resource-directory-list"
    >
      {resources.map((resource) => (
        <li
          key={resource.id}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:border-[var(--accent)]"
        >
          <Link
            href={`/resources/${encodeURIComponent(resource.id)}`}
            className="flex flex-col gap-2"
          >
            <span className="text-sm font-semibold text-[var(--foreground)]">{resource.name}</span>
            {resource.description ? (
              <span className="line-clamp-2 text-xs text-[var(--muted)]">{resource.description}</span>
            ) : null}
            {resource.externalId ? (
              <span className="text-xs text-[var(--muted)]">External ID: {resource.externalId}</span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}
