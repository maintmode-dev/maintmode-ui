"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Filter, Plus, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import { canWrite } from "@/domain/auth/permissions";
import { isResourceArchived } from "@/domain/resource/resource";
import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";
import { Switch } from "@/shared/ui/shadcn/switch";
import { Label } from "@/shared/ui/shadcn/label";
import { Stack } from "@/shared/ui/domain/stack";
import { formatUtc } from "@/shared/ui/lib/format";

import { useMeQuery } from "@/features/_shared/queries/use-me-query";

import { useResourcesQuery } from "./queries/use-resources-query";
import { ResourceCreateDialog } from "./resource-create-dialog";
import { Skeleton } from "@/shared/ui/domain/skeleton";
import { CalendarError } from "@/shared/ui/states";

const PAGE_SIZE = 50;

export function ResourcesListPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // Gate the create affordances on write-capable roles. Fail-closed: while
  // `/me` is pending or errored, `data` is undefined → `canWrite` false → the
  // CTAs stay hidden, so no guest ever sees a create action they can't use.
  const me = useMeQuery().data;
  const canCreate = canWrite(me?.roles);

  // Debounce the name filter so each keystroke doesn't fire a backend request;
  // filtering is server-side (the list endpoint matches on `name`).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const resourcesQuery = useResourcesQuery({
    name: debouncedQuery || undefined,
    archived: showArchived,
    limit: PAGE_SIZE,
  });
  const page = resourcesQuery.data;
  const resources = page?.resources ?? [];
  // EC-2: the list is one page; `total` can exceed what's loaded here.
  const hasMore = page ? page.total > resources.length : false;

  // `N active · N archived` caption (contract). Archived rows are only present
  // once `Show archived` widens the fetch, so the archived count reads 0 until
  // the toggle is on — accurate to what's loaded.
  const archivedCount = resources.filter((r) => isResourceArchived(r)).length;
  const activeCount = resources.length - archivedCount;

  return (
    <div className="mx-auto max-w-[1200px] p-6 space-y-4">
      <header className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <h1 className="h1">Resources</h1>
          {page ? (
            <p className="mt-1 font-mono tabular-nums text-xs text-fg-dim">
              {activeCount} active · {archivedCount} archived
            </p>
          ) : null}
        </div>
        {canCreate ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5" aria-hidden="true" /> New resource
          </Button>
        ) : null}
      </header>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[260px] max-w-[420px]">
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-fg-dim"
            aria-hidden="true"
          />
          <Input
            placeholder="Search resources by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 pr-8"
            aria-label="Search resources by name"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-dim hover:text-fg"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Switch id="archived" checked={showArchived} onCheckedChange={setShowArchived} />
          <Label htmlFor="archived" className="text-sm">
            Show archived
          </Label>
        </div>
      </div>

      {resourcesQuery.isPending ? (
        <div className="space-y-2">
          <Skeleton type="row" width="40%" />
          <Skeleton type="block" />
          <Skeleton type="block" />
          <Skeleton type="block" />
        </div>
      ) : resourcesQuery.isError ? (
        <CalendarError onRetry={() => resourcesQuery.refetch()} />
      ) : resources.length === 0 ? (
        debouncedQuery ? (
          <Stack
            icon={<Filter aria-hidden="true" />}
            title="No resources match these filters"
            caption="Adjust the search or clear it to see the full catalog."
            cta={
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-sm text-brand hover:underline"
              >
                Clear filters
              </button>
            }
          />
        ) : (
          <Stack
            icon={<Search aria-hidden="true" />}
            title="No resources yet"
            caption={
              canCreate
                ? "Create a resource so maintenance windows have something to schedule against."
                : "No resources have been added yet."
            }
            cta={
              canCreate ? (
                <Button onClick={() => setCreateOpen(true)} size="sm">
                  <Plus className="size-3" aria-hidden="true" /> New resource
                </Button>
              ) : undefined
            }
          />
        )
      ) : (
        <>
          <div className="bg-bg-elev-1 border border-border-subtle rounded-md overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-bg-elev-2 border-b border-border-subtle">
                <tr>
                  {["Name", "Created", ""].map((h, i) => (
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
                {resources.map((r) => {
                  const archived = isResourceArchived(r);
                  const href = `/resources/${r.id}`;
                  const navigate = () => router.push(href);
                  return (
                    <tr
                      key={r.id}
                      role="link"
                      tabIndex={0}
                      aria-label={`Open ${r.name}`}
                      onClick={navigate}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate();
                        }
                      }}
                      className="group cursor-pointer border-b border-border-subtle last:border-b-0 hover:bg-bg-row-hover focus-visible:bg-bg-row-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-border-strong"
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className={archived ? "text-fg-muted" : "text-fg"}>{r.name}</span>
                          {archived ? (
                            <span className="inline-flex items-center rounded-full border border-border-subtle bg-bg-elev-3 px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
                              Archived
                            </span>
                          ) : null}
                        </div>
                        {r.description ? <div className="text-xs text-fg-dim">{r.description}</div> : null}
                      </td>
                      <td className="px-3 py-2.5 font-mono tabular-nums text-xs text-fg-muted">
                        {formatUtc(r.created_at)}
                      </td>
                      <td className="px-3 py-2.5 w-12 text-right">
                        <Link
                          href={href}
                          tabIndex={-1}
                          aria-hidden="true"
                          onClick={(e) => e.stopPropagation()}
                          className="text-fg-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                        >
                          <ChevronRight className="size-3.5 inline" aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {hasMore ? (
            <p className="text-xs text-fg-dim">
              Showing {resources.length} of {page?.total}. Refine the search to narrow results.
            </p>
          ) : null}
        </>
      )}

      <ResourceCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
