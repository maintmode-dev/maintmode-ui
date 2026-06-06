"use client";

import Link from "next/link";
import { ArrowRight, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";
import { Switch } from "@/shared/ui/shadcn/switch";
import { Label } from "@/shared/ui/shadcn/label";
import { Stack } from "@/shared/ui/domain/stack";
import { formatRelative } from "@/shared/ui/lib/format";

import { useResourcesQuery } from "./queries/use-resources-query";
import { ResourceCreateModal } from "./resource-create-modal";
import { Skeleton } from "@/shared/ui/domain/skeleton";
import { CalendarError } from "@/shared/ui/states";

const PAGE_SIZE = 50;

export function ResourcesListPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

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

  return (
    <div className="mx-auto max-w-[1200px] p-6 space-y-4">
      <header className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <h1 className="h1">Resources</h1>
          <p className="body-sm mt-1">Catalog of services, databases, and clusters tracked by MaintMode.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-3.5" aria-hidden="true" /> New resource
        </Button>
      </header>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[260px] max-w-[420px]">
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-fg-dim"
            aria-hidden="true"
          />
          <Input
            placeholder="Search by name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
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
        <Stack
          icon={<Search aria-hidden="true" />}
          title="No resources match"
          caption="Adjust the filter or create a new resource."
          cta={
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <Plus className="size-3" aria-hidden="true" /> New resource
            </Button>
          }
        />
      ) : (
        <>
          <div className="bg-bg-elev-1 border border-border-subtle rounded-md overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-bg-elev-2 border-b border-border-subtle">
                <tr>
                  {["Name", "External ID", "Status", "Last updated", ""].map((h, i) => (
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
                {resources.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border-subtle last:border-b-0 hover:bg-bg-row-hover"
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-fg">{r.name}</div>
                      {r.description ? <div className="text-xs text-fg-dim">{r.description}</div> : null}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-fg-muted">{r.external_id || "—"}</td>
                    <td className="px-3 py-2.5 capitalize text-fg-muted">{r.status}</td>
                    <td className="px-3 py-2.5 text-fg-muted">{formatRelative(r.updated_at)}</td>
                    <td className="px-3 py-2.5 w-12 text-right">
                      <Link
                        href={`/resources/${r.id}`}
                        className="text-fg-muted hover:text-fg"
                        aria-label={`Open ${r.name}`}
                      >
                        <ArrowRight className="size-3.5 inline" aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
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

      <ResourceCreateModal open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
