"use client";

import Link from "next/link";
import { ChevronRight, History } from "lucide-react";
import { useMemo, useState } from "react";

import type { CalendarEvent, MaintenanceStatus } from "@/domain/maintenance/maintenance";
import type { RelatedMaintenanceFeed } from "@/features/calendar/queries/use-related-maintenance-query";
import { Stack } from "@/shared/ui/domain/stack";
import { StatusBadge } from "@/shared/ui/domain/status-badge";
import { Skeleton } from "@/shared/ui/domain/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/shadcn/tabs";
import { formatDateTime } from "@/shared/ui/lib/format";
import { useTimezone } from "@/features/_shared/timezone/use-timezone";

/**
 * "Related maintenance" section of ChannelDetailPage — the maintenances that
 * notify this channel (`notify_targets.channel_ids[]`), split into Active /
 * Past tabs. Data comes from the calendar feed filtered server-side by
 * `channel_ids` (forwarded through the `/api/calendar` BFF and
 * `useCalendarQuery`).
 *
 * Source intent: the channel-detail design snapshot (Section 2).
 *
 * Presentational: the window and the query live in `useRelatedMaintenanceQuery`,
 * called by NotifyChannelDetailPage above its early returns, and arrive here as
 * `feed`. Owning the hook here is what created the request waterfall — the page
 * renders this section below a pending-skeleton return, so the fetch could not
 * start until the detail query resolved. Do not reintroduce a query here.
 */

/** Active = not-yet-finished (draft / planned / in_progress). Past = terminal. */
const ACTIVE_STATUSES: ReadonlySet<MaintenanceStatus> = new Set(["draft", "planned", "in_progress"]);

function isActive(m: CalendarEvent): boolean {
  return ACTIVE_STATUSES.has(m.status);
}

export function NotifyChannelRelatedMaintenance({ feed }: { feed: RelatedMaintenanceFeed }) {
  const { from, to, query } = feed;
  const [tab, setTab] = useState<"active" | "past">("active");
  const { zone } = useTimezone();

  const { active, past, total } = useMemo(() => {
    const items = query.data ?? [];
    const activeList = items.filter(isActive);
    const pastList = items.filter((m) => !isActive(m));
    // Active: soonest first. Past: most recent first.
    activeList.sort((a, b) => a.planned_period.start.localeCompare(b.planned_period.start));
    pastList.sort((a, b) => b.planned_period.start.localeCompare(a.planned_period.start));
    return { active: activeList, past: pastList, total: items.length };
  }, [query.data]);

  const rows = tab === "active" ? active : past;

  return (
    <section className="space-y-3">
      {/* NOTE: the contract's "View all in calendar →" deep-link is intentionally
          omitted until the Calendar page consumes `channel_ids` from the URL —
          otherwise the link lands on an unfiltered calendar (dead affordance).
          Restore the link once that wiring ships. */}
      <div className="space-y-0.5">
        <h2 className="text-2xs font-semibold uppercase tracking-[0.08em] text-fg-dim">
          Related maintenance
          <span className="ml-2 font-mono tabular-nums text-fg-muted">· {total} total</span>
        </h2>
        {/* The calendar feed is capped at a ≤90-day window (backend limit), so
            this is a bounded view, not the channel's full history. Surface the
            exact range so `N total` reads as "N in this window", not "N ever". */}
        <p className="text-xs text-fg-dim">
          Showing maintenance from <span className="font-mono tabular-nums">{from}</span> to{" "}
          <span className="font-mono tabular-nums">{to}</span> (UTC)
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "active" | "past")}>
        <TabsList>
          <TabsTrigger value="active">Active · {active.length}</TabsTrigger>
          <TabsTrigger value="past">Past · {past.length}</TabsTrigger>
        </TabsList>
      </Tabs>

      {query.isPending ? (
        <div className="space-y-2">
          <Skeleton type="block" />
          <Skeleton type="block" />
        </div>
      ) : query.isError ? (
        <Stack
          icon={<History aria-hidden="true" />}
          title="Couldn't load related maintenance"
          caption="The maintenance feed is unavailable right now."
        />
      ) : rows.length === 0 ? (
        <Stack
          icon={<History aria-hidden="true" />}
          title={tab === "active" ? "No active maintenance for this channel" : "No past maintenance yet"}
          caption={
            tab === "active"
              ? "Maintenance windows that notify this channel will appear here."
              : "Completed and canceled maintenance for this channel will appear here."
          }
        />
      ) : (
        <ul className="rounded-md border border-border-subtle bg-bg-elev-1 divide-y divide-border-subtle">
          {rows.map((m) => (
            <li key={m.id}>
              <Link
                href={`/maintenance/${m.id}`}
                className="grid h-14 grid-cols-[110px_190px_1fr_28px] items-center gap-3 px-4 hover:bg-bg-row-hover"
              >
                <span className="justify-self-start">
                  <StatusBadge status={m.status} size="xs" />
                </span>
                <span className="font-mono tabular-nums text-xs text-fg-muted">
                  {formatDateTime(m.planned_period.start, zone)}
                </span>
                <span className="truncate text-sm">{m.title}</span>
                <ChevronRight className="size-4 justify-self-end text-fg-muted" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
