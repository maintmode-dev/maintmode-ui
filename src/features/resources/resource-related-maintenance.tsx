"use client";

import Link from "next/link";
import { ChevronRight, History } from "lucide-react";
import { useMemo, useState } from "react";

import type { Maintenance, MaintenanceStatus } from "@/domain/maintenance/maintenance";
import { useCalendarQuery } from "@/features/calendar/queries/use-calendar-query";
import { Stack } from "@/shared/ui/domain/stack";
import { StatusBadge } from "@/shared/ui/domain/status-badge";
import { Skeleton } from "@/shared/ui/domain/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/shadcn/tabs";
import { formatDateTime } from "@/shared/ui/lib/format";
import { useTimezone } from "@/features/_shared/timezone/use-timezone";

/**
 * "Related maintenance" section of ResourceDetailPage — the maintenances scoped
 * to this resource (`resource_ids[]`), split into Active / Past tabs. Data comes
 * from the calendar feed filtered server-side by `resource_ids` (an existing
 * backend filter, forwarded through the `/api/calendar` BFF and useCalendarQuery).
 *
 * Source intent: maintmode-docs/design-snapshots/resource-detail (Section 2).
 * Mirrors the channel-detail Related section.
 */

/**
 * Window for the related feed. The calendar endpoint requires `from`/`to` AND
 * caps the interval at 90 days (checked after `to` is expanded to end-of-day,
 * so a span of exactly 90 calendar dates is rejected — the largest accepted
 * `to − from` is 89 dates). Stay safely under it (59 + 30 = 89) and bias toward
 * the recent past + near future, the two cohorts the Active / Past tabs show.
 */
const PAST_WINDOW_DAYS = 59;
const FUTURE_WINDOW_DAYS = 30;

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Active = not-yet-finished (draft / planned / in_progress). Past = terminal. */
const ACTIVE_STATUSES: ReadonlySet<MaintenanceStatus> = new Set(["draft", "planned", "in_progress"]);

function isActive(m: Maintenance): boolean {
  return ACTIVE_STATUSES.has(m.status);
}

export function ResourceRelatedMaintenance({ resourceId }: { resourceId: string }) {
  const [tab, setTab] = useState<"active" | "past">("active");
  const { zone } = useTimezone();

  const { from, to } = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - PAST_WINDOW_DAYS);
    const end = new Date(now);
    end.setDate(end.getDate() + FUTURE_WINDOW_DAYS);
    return { from: toIsoDate(start), to: toIsoDate(end) };
  }, []);

  const query = useCalendarQuery({ from, to, resourceIds: [resourceId] });

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
          omitted until the Calendar page consumes `resource_ids` from the URL —
          otherwise it lands on an unfiltered calendar. Same call as
          channel-detail; restore the link once that wiring ships. */}
      <div className="space-y-0.5">
        <h2 className="text-2xs font-semibold uppercase tracking-[0.08em] text-fg-dim">
          Related maintenance
          <span className="ml-2 font-mono tabular-nums text-fg-muted">· {total} total</span>
        </h2>
        {/* The calendar feed is capped at a ≤90-day window (backend limit), so
            this is a bounded view, not the resource's full history. Surface the
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
          title={tab === "active" ? "No active maintenance for this resource" : "No past maintenance yet"}
          caption={
            tab === "active"
              ? "Maintenance windows scoped to this resource will appear here."
              : "Completed and canceled maintenance for this resource will appear here."
          }
        />
      ) : (
        <ul className="rounded-md border border-border-subtle bg-bg-elev-1 divide-y divide-border-subtle">
          {rows.map((m) => (
            <li key={m.id}>
              <Link
                href={`/maintenance/${m.id}`}
                className="grid h-14 grid-cols-[110px_190px_1fr_auto_28px] items-center gap-3 px-4 hover:bg-bg-row-hover"
              >
                <span className="justify-self-start">
                  <StatusBadge status={m.status} size="xs" />
                </span>
                <span className="font-mono tabular-nums text-xs text-fg-muted">
                  {formatDateTime(m.planned_period.start, zone)}
                </span>
                <span className="truncate text-sm">{m.title}</span>
                <span className="font-mono text-xs text-fg-dim">{m.reference ?? ""}</span>
                <ChevronRight className="size-4 justify-self-end text-fg-muted" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
