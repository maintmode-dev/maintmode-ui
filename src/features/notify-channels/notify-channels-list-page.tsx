"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Filter, MessageCircle, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { isNotifyChannelArchived } from "@/domain/notify-channel/notify-channel";
import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";
import { Switch } from "@/shared/ui/shadcn/switch";
import { Label } from "@/shared/ui/shadcn/label";
import { Stack } from "@/shared/ui/domain/stack";
import { Skeleton } from "@/shared/ui/domain/skeleton";
import { SemanticPill } from "@/shared/ui/domain/semantic-pill";
import { TransportPill } from "@/shared/ui/domain/transport-pill";
import { CalendarError } from "@/shared/ui/states";
import { formatUtc } from "@/shared/ui/lib/format";

import { useNotifyChannelsQuery } from "./queries/use-notify-channels-query";
import { NotifyChannelCreateDialog } from "./notify-channel-create-dialog";
import { transportStatusCopy } from "./transports";

/**
 * Channels catalog (`/channels`) — verbatim sibling of the resources list, with
 * a Transport-pill column standing in for the resource status. The backend list
 * has no `name` filter, so search is applied client-side over the loaded page;
 * the `Show archived` toggle is server-side (it widens `include_archived`).
 */
export function NotifyChannelsListPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const channelsQuery = useNotifyChannelsQuery({ archived: showArchived });
  const channelsData = channelsQuery.data;

  const trimmedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const channels = channelsData ?? [];
    return trimmedQuery ? channels.filter((c) => c.name.toLowerCase().includes(trimmedQuery)) : channels;
  }, [channelsData, trimmedQuery]);

  const isFiltering = trimmedQuery.length > 0;

  // `N active · N archived` caption (contract). Counts come from the loaded set:
  // archived rows are only present once `Show archived` widens the fetch, so the
  // archived count reads 0 until the toggle is on — accurate to what's loaded.
  const allChannels = channelsData ?? [];
  const archivedCount = allChannels.filter((c) => isNotifyChannelArchived(c)).length;
  const activeCount = allChannels.length - archivedCount;

  return (
    <div className="mx-auto max-w-[1200px] p-6 space-y-4">
      <header className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <h1 className="h1">Channels</h1>
          {channelsData ? (
            <p className="mt-1 font-mono tabular-nums text-xs text-fg-dim">
              {activeCount} active · {archivedCount} archived
            </p>
          ) : null}
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-3.5" aria-hidden="true" /> New channel
        </Button>
      </header>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[260px] max-w-[420px]">
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-fg-dim"
            aria-hidden="true"
          />
          <Input
            placeholder="Search channels by name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 pr-8"
            aria-label="Search channels by name"
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

      {channelsQuery.isPending ? (
        <div className="space-y-2">
          <Skeleton type="row" width="40%" />
          <Skeleton type="block" />
          <Skeleton type="block" />
          <Skeleton type="block" />
        </div>
      ) : channelsQuery.isError ? (
        <CalendarError onRetry={() => channelsQuery.refetch()} />
      ) : filtered.length === 0 ? (
        isFiltering ? (
          <Stack
            icon={<Filter aria-hidden="true" />}
            title="No channels match these filters"
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
            icon={<MessageCircle aria-hidden="true" />}
            title="No channels yet"
            caption="Create a channel so maintenance windows have somewhere to send notifications."
            cta={
              <Button onClick={() => setCreateOpen(true)} size="sm">
                <Plus className="size-3" aria-hidden="true" /> New channel
              </Button>
            }
          />
        )
      ) : (
        <div className="bg-bg-elev-1 border border-border-subtle rounded-md overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-bg-elev-2 border-b border-border-subtle">
              <tr>
                {["Name", "Transport", "Created", ""].map((h, i) => (
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
              {filtered.map((c) => {
                const archived = isNotifyChannelArchived(c);
                // null for "ok"; disabled / not_configured / unknown statuses
                // all yield a warning badge (fail-visible, RUK-199).
                const statusCopy = transportStatusCopy(c.transportStatus);
                const href = `/channels/${c.id}`;
                const navigate = () => router.push(href);
                return (
                  <tr
                    key={c.id}
                    role="link"
                    tabIndex={0}
                    aria-label={`Open ${c.name}`}
                    onClick={navigate}
                    onKeyDown={(e) => {
                      // Whole row is the navigation target (contract). Activate on
                      // Enter / Space like a button; don't hijack other keys.
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate();
                      }
                    }}
                    className="group cursor-pointer border-b border-border-subtle last:border-b-0 hover:bg-bg-row-hover focus-visible:bg-bg-row-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-border-strong"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={archived ? "text-fg-muted" : "text-fg"}>{c.name}</span>
                        {archived ? (
                          <span className="inline-flex items-center rounded-full border border-border-subtle bg-bg-elev-3 px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
                            Archived
                          </span>
                        ) : null}
                        {statusCopy ? (
                          <SemanticPill tone="warning" className="normal-case tracking-normal">
                            {statusCopy.badge}
                          </SemanticPill>
                        ) : null}
                      </div>
                      {c.description ? <div className="text-xs text-fg-dim">{c.description}</div> : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <TransportPill transport={c.transport} archived={archived} />
                    </td>
                    <td className="px-3 py-2.5 font-mono tabular-nums text-xs text-fg-muted">
                      {formatUtc(c.createdAt)}
                    </td>
                    <td className="px-3 py-2.5 w-12 text-right">
                      <Link
                        href={href}
                        tabIndex={-1}
                        aria-hidden="true"
                        // Row-level nav already handles activation + a11y; this
                        // is a hover-revealed visual affordance (`›`) and a
                        // middle-click / open-in-new-tab escape hatch.
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
      )}

      <NotifyChannelCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
