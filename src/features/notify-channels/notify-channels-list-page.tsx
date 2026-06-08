"use client";

import Link from "next/link";
import { ArrowRight, Filter, MessageCircle, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { isNotifyChannelArchived } from "@/domain/notify-channel/notify-channel";
import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";
import { Switch } from "@/shared/ui/shadcn/switch";
import { Label } from "@/shared/ui/shadcn/label";
import { Stack } from "@/shared/ui/domain/stack";
import { Skeleton } from "@/shared/ui/domain/skeleton";
import { TransportPill } from "@/shared/ui/domain/transport-pill";
import { CalendarError } from "@/shared/ui/states";
import { formatRelative } from "@/shared/ui/lib/format";

import { useNotifyChannelsQuery } from "./queries/use-notify-channels-query";
import { NotifyChannelCreateModal } from "./notify-channel-create-modal";

/**
 * Channels catalog (`/channels`) — verbatim sibling of the resources list, with
 * a Transport-pill column standing in for the resource status. The backend list
 * has no `name` filter, so search is applied client-side over the loaded page;
 * the `Show archived` toggle is server-side (it widens `include_archived`).
 */
export function NotifyChannelsListPage() {
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

  return (
    <div className="mx-auto max-w-[1200px] p-6 space-y-4">
      <header className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <h1 className="h1">Channels</h1>
          <p className="body-sm mt-1">
            Notification channels maintenance windows can notify. Used as the source for notify targets.
          </p>
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
            className="pl-8"
            aria-label="Search channels by name"
          />
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
              <Button onClick={() => setQuery("")} size="sm" variant="outline">
                Clear search
              </Button>
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
                {["Name", "Transport", "Last updated", ""].map((h, i) => (
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
                return (
                  <tr
                    key={c.id}
                    className="border-b border-border-subtle last:border-b-0 hover:bg-bg-row-hover"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={archived ? "text-fg-muted" : "text-fg"}>{c.name}</span>
                        {archived ? (
                          <span className="inline-flex items-center rounded-full border border-border-subtle bg-bg-elev-3 px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
                            Archived
                          </span>
                        ) : null}
                      </div>
                      {c.description ? <div className="text-xs text-fg-dim">{c.description}</div> : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <TransportPill transport={c.transport} archived={archived} />
                    </td>
                    <td className="px-3 py-2.5 text-fg-muted">
                      {formatRelative(c.updatedAt || c.createdAt)}
                    </td>
                    <td className="px-3 py-2.5 w-12 text-right">
                      <Link
                        href={`/channels/${c.id}`}
                        className="text-fg-muted hover:text-fg"
                        aria-label={`Open ${c.name}`}
                      >
                        <ArrowRight className="size-3.5 inline" aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <NotifyChannelCreateModal open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
