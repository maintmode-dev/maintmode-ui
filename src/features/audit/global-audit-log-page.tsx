"use client";

import type * as React from "react";
import { CalendarDays, ChevronRight, ScrollText, Search, X } from "lucide-react";
import { useState } from "react";

import type { DateRange as RDPDateRange } from "react-day-picker";

import { Input } from "@/shared/ui/shadcn/input";
import { Button } from "@/shared/ui/shadcn/button";
import { Calendar } from "@/shared/ui/shadcn/calendar";
import { Label } from "@/shared/ui/shadcn/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/shadcn/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/shadcn/select";
import { Chip } from "@/shared/ui/domain/chip";
import { Stack } from "@/shared/ui/domain/stack";
import { Skeleton } from "@/shared/ui/domain/skeleton";
import { AuditError } from "@/shared/ui/states";
import { formatDate, formatRelative, formatUtc } from "@/shared/ui/lib/format";
import { cn } from "@/shared/ui/lib/cn";

import {
  type AuditAction,
  type AuditEvent,
  auditActorFull,
  auditActorHandle,
} from "@/domain/audit/audit-log";
import {
  AUDIT_CATEGORIES,
  type AuditCategory,
  auditActionDotToken,
  auditActionLabel,
} from "@/domain/audit/audit-presentation";

import { useGlobalAuditQuery } from "./queries/use-audit-queries";

// Date-range presets (frozen contract: default 7d). `hours` is turned into a
// `created_from` RFC3339 bound for the server query; `null` = All time.
const DATE_PRESETS: { id: string; label: string; hours: number | null }[] = [
  { id: "24h", label: "24h", hours: 24 },
  { id: "7d", label: "7d", hours: 24 * 7 },
  { id: "30d", label: "30d", hours: 24 * 30 },
  { id: "all", label: "All time", hours: null },
];
const DEFAULT_PRESET = "7d";

const PAGE_SIZES = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 50;

/** Inclusive custom date window, `yyyy-mm-dd` strings from `<input type=date>`. */
interface DateRange {
  from: string;
  to: string;
}

/** Resolve the active date window to RFC3339 `{ from, to }` for the server. */
function resolveDateWindow(
  preset: string,
  customRange: DateRange | null,
  nowMs: number,
): { from?: string; to?: string } {
  if (customRange) {
    // Inclusive: `to` extends to end-of-day so the last day is fully covered.
    return {
      from: new Date(`${customRange.from}T00:00:00`).toISOString(),
      to: new Date(`${customRange.to}T23:59:59.999`).toISOString(),
    };
  }
  const active = DATE_PRESETS.find((p) => p.id === preset) ?? DATE_PRESETS[1];
  if (active.hours == null) return {};
  return { from: new Date(nowMs - active.hours * 3_600_000).toISOString() };
}

export function GlobalAuditLogPage() {
  const [category, setCategory] = useState<AuditCategory>("all");
  const [actorQuery, setActorQuery] = useState("");
  const [preset, setPreset] = useState(DEFAULT_PRESET);
  // A custom `{ from, to }` (yyyy-mm-dd) overrides the preset window when set —
  // the preset chips dim and a clearable badge shows the range.
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);

  // Filter changes reset to page 1 — done in the setters below (not an effect),
  // so there's no cascading render.
  const onCategory = (c: AuditCategory) => {
    setCategory(c);
    setPage(1);
  };
  const onActorQuery = (v: string) => {
    setActorQuery(v);
    setPage(1);
  };
  const onPreset = (p: string) => {
    setPreset(p);
    setCustomRange(null); // picking a preset clears any custom window
    setPage(1);
  };
  const onCustomRange = (range: DateRange) => {
    setCustomRange(range);
    setPage(1);
  };
  const onClearCustomRange = () => {
    setCustomRange(null);
    setPage(1);
  };
  const onPageSize = (n: number) => {
    setPageSize(n);
    setPage(1);
  };
  const onClearFilters = () => {
    setCategory("all");
    setActorQuery("");
    setPreset("all");
    setCustomRange(null);
    setPage(1);
  };

  // "Now" is captured once on mount (lazy init) so the preset window is a
  // stable bound across renders — a remount/reload re-anchors it.
  const [nowMs] = useState(() => Date.now());

  // The backend does the filtering, counting, and paging. We send the resolved
  // window + category + actor + offset and render whatever comes back.
  const dateWindow = resolveDateWindow(preset, customRange, nowMs);
  const auditQuery = useGlobalAuditQuery({
    category,
    actor: actorQuery,
    from: dateWindow.from,
    to: dateWindow.to,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const pageEvents = auditQuery.data?.events ?? [];
  const total = auditQuery.data?.total ?? 0;
  const facets = auditQuery.data?.facets;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);

  const lastActivity = pageEvents[0]?.created_at;

  return (
    <div className="w-full px-6 py-6 space-y-4">
      <header className="space-y-1">
        <h1 className="h1">Audit log</h1>
        <p className="caption font-mono tabular-nums text-fg-dim">
          {(facets?.all ?? total).toLocaleString()} events
          {lastActivity ? <> · Last activity {formatRelative(lastActivity)}</> : null}
        </p>
      </header>

      {/* Filter bar — Row 1 category chips, Row 2 actor + date range. */}
      <div className="space-y-3">
        <div className="flex gap-2 flex-wrap">
          {AUDIT_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => onCategory(cat.id)}
              className="appearance-none"
              aria-pressed={category === cat.id}
            >
              <Chip selected={category === cat.id}>
                {cat.label}
                <span className="ml-1.5 font-mono tabular-nums text-fg-dim">
                  · {facets ? facets[cat.id] : "—"}
                </span>
              </Chip>
            </button>
          ))}
        </div>

        <div className="flex items-start gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="relative w-[260px]">
              <Search
                className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-fg-dim"
                aria-hidden="true"
              />
              <Input
                placeholder="Filter by actor email"
                value={actorQuery}
                onChange={(e) => onActorQuery(e.target.value)}
                className="pl-8 font-mono text-xs"
                aria-label="Filter by actor email"
              />
            </div>
            <p className="text-[11px] text-fg-dim">Exact email match. Autocomplete coming soon.</p>
          </div>

          <div className="h-8 w-px self-start bg-border-subtle" aria-hidden="true" />

          <div className="flex gap-2 flex-wrap items-center">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPreset(p.id)}
                className={cn("appearance-none", customRange && "opacity-40")}
                aria-pressed={!customRange && preset === p.id}
              >
                <Chip selected={!customRange && preset === p.id}>{p.label}</Chip>
              </button>
            ))}
            <CustomRangePicker value={customRange} onApply={onCustomRange} />
            {customRange ? (
              <span className="inline-flex items-center gap-1.5 rounded-sm border border-border-strong bg-bg-row-selected px-2 py-[3px] text-xs">
                <span className="font-mono tabular-nums text-fg">
                  {formatDate(`${customRange.from}T00:00:00`)} – {formatDate(`${customRange.to}T00:00:00`)}
                </span>
                <button
                  type="button"
                  onClick={onClearCustomRange}
                  className="appearance-none text-fg-dim hover:text-fg"
                  aria-label="Clear custom date range"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {auditQuery.isPending ? (
        <div className="space-y-2">
          <Skeleton type="row" width="40%" />
          <Skeleton type="block" />
          <Skeleton type="block" />
        </div>
      ) : auditQuery.isError ? (
        <AuditError onRetry={() => auditQuery.refetch()} />
      ) : total === 0 ? (
        <Stack
          icon={<ScrollText aria-hidden="true" />}
          title="No events match these filters"
          caption="Adjust the actor, date range, or category to widen the search."
          cta={
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <div className="bg-bg-elev-1 border border-border-subtle rounded-md overflow-hidden">
            {/* table-fixed + explicit widths: long UUID emails would otherwise
                blow the Actor column out under table-auto and starve the flex
                Details column. Details takes the remaining width. */}
            <table className="w-full table-fixed text-left text-sm">
              {/* Time bumped 138→168px: the mono `YYYY-MM-DD HH:mm UTC` stamp
                  measures ~144px and with the cell's px-3 padding needs ~168px;
                  at the contract's 138px it clips the trailing `UTC` under
                  table-fixed. Details (flex) absorbs the extra and stays the
                  widest column. */}
              <colgroup>
                <col className="w-[18px]" />
                <col className="w-[168px]" />
                <col className="w-[150px]" />
                <col className="w-[200px]" />
                <col className="w-[200px]" />
                <col />
              </colgroup>
              <thead className="bg-bg-elev-2 border-b border-border-subtle">
                <tr>
                  <th aria-hidden="true" />
                  {["Time (UTC)", "Action", "Actor", "Target", "Details"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageEvents.map((e) => (
                  <AuditRow key={e.id} event={e} />
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={safePage}
            pageCount={pageCount}
            pageSize={pageSize}
            total={total}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(pageCount, p + 1))}
            onPageSize={onPageSize}
          />
        </>
      )}
    </div>
  );
}

function AuditRow({ event }: { event: AuditEvent }) {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((o) => !o);

  return (
    <>
      <tr
        className="border-b border-border-subtle last:border-b-0 hover:bg-bg-row-hover cursor-pointer"
        onClick={toggle}
        onKeyDown={(ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            toggle();
          }
        }}
        tabIndex={0}
        role="button"
        aria-expanded={open}
      >
        <td className="pl-3 align-middle">
          <ChevronRight
            className={cn("size-3.5 text-fg-dim transition-transform", open && "rotate-90")}
            aria-hidden="true"
          />
        </td>
        <td className="px-3 py-2.5 font-mono tabular-nums text-xs text-fg whitespace-nowrap">
          {formatUtc(event.created_at)}
        </td>
        <td className="px-3 py-2.5">
          <ActionCell action={event.action} />
        </td>
        <td className="px-3 py-2.5">
          <ActorCell event={event} />
        </td>
        <td className="px-3 py-2.5">
          <TargetCell event={event} />
        </td>
        <td className="px-3 py-2.5 text-fg-muted truncate" title={event.details ?? undefined}>
          {event.details ?? "—"}
        </td>
      </tr>
      {open ? (
        <tr className="bg-bg-elev-2/40 border-b border-border-subtle">
          <td />
          <td colSpan={5} className="px-3 py-3">
            <ExpandedDetail event={event} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

/**
 * Per-action expanded detail, driven by the structured `metadata` payload:
 * login → IP / User agent / Session (+ Failure reason on `login_failed`);
 * logout → Session / Kind; role events → Target + a role diff (added/removed)
 * or the assigned role set. Falls back to the one-line `details` summary +
 * timestamp when no metadata is present.
 */
/** `name · email` when both differ, else whichever single value exists. */
function joinNameEmail(name?: string, email?: string): string | undefined {
  const n = name?.trim();
  const e = email?.trim();
  if (n && e && n !== e) return `${n} · ${e}`;
  return n || e || undefined;
}

function ExpandedDetail({ event }: { event: AuditEvent }) {
  const m = event.metadata;
  const rows: { label: string; value: React.ReactNode }[] = [];

  // Who performed the action — always first, as a single `name · email` line
  // (one or the other when only one is known; "Unknown" when the backend
  // recorded no actor — RUK-174).
  rows.push({ label: "Actor", value: auditActorFull(event) });

  if (event.action === "login_success" || event.action === "login_failed") {
    if (m?.ip) rows.push({ label: "IP", value: m.ip });
    if (m?.user_agent) rows.push({ label: "User agent", value: m.user_agent });
    if (m?.session_id) rows.push({ label: "Session", value: m.session_id });
    if (m?.failure_reason)
      rows.push({ label: "Reason", value: <span className="text-destructive-fg">{m.failure_reason}</span> });
  } else if (event.action === "logout_success") {
    if (m?.session_id) rows.push({ label: "Session", value: m.session_id });
    if (m?.logout_kind) rows.push({ label: "Kind", value: m.logout_kind });
  } else {
    // Role / block events — target identity as a single `name · email` line.
    const target = joinNameEmail(m?.target_display_name, m?.target_email) || event.target_id;
    if (target) rows.push({ label: "Target", value: target });
    if (m?.roles_added?.length)
      rows.push({ label: "Added", value: <RoleDiff roles={m.roles_added} sign="+" /> });
    if (m?.roles_removed?.length)
      rows.push({ label: "Removed", value: <RoleDiff roles={m.roles_removed} sign="−" /> });
    if (m?.roles?.length && !m.roles_added?.length && !m.roles_removed?.length)
      rows.push({ label: "Roles", value: <RoleDiff roles={m.roles} /> });
  }

  // Always anchor on the human summary + exact timestamp.
  if (event.details) rows.push({ label: "Detail", value: event.details });
  rows.push({ label: "Timestamp", value: formatUtc(event.created_at) });

  return (
    <dl className="grid grid-cols-[96px_1fr] gap-x-4 gap-y-1.5 text-xs">
      {rows.map((r, i) => (
        <div key={`${r.label}-${i}`} className="contents">
          <dt className="text-fg-dim">{r.label}</dt>
          <dd className="font-mono text-fg-muted break-words">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Role pills for the expand diff: green `+added`, red `−removed`, neutral set. */
function RoleDiff({ roles, sign }: { roles: string[]; sign?: "+" | "−" }) {
  const tone =
    sign === "+"
      ? "text-[var(--status-completed-fg)]"
      : sign === "−"
        ? "text-destructive-fg"
        : "text-fg-muted";
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {roles.map((r) => (
        <span key={r} className={cn("rounded-sm bg-bg-elev-3 px-1.5 py-px", tone)}>
          {sign ? `${sign} ` : ""}
          {r}
        </span>
      ))}
    </span>
  );
}

function ActionCell({ action }: { action: AuditAction }) {
  // Dot and label share the action's colour (per the mockup) — one token drives
  // both so they never drift apart.
  const color = `var(${auditActionDotToken(action)})`;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap" style={{ color }}>
      <span className="size-2 rounded-full shrink-0" style={{ background: color }} aria-hidden="true" />
      <span className="text-xs">{auditActionLabel(action)}</span>
    </span>
  );
}

/** Actor cell — initial avatar + resolved @handle (display name → actor email). */
function ActorCell({ event }: { event: AuditEvent }) {
  if (!event.actor && !event.actor_display_name) return <span className="text-fg-dim">—</span>;
  const handle = auditActorHandle(event);
  return (
    <span className="flex items-center gap-2" title={event.actor ?? handle}>
      <InitialAvatar label={handle} />
      <span className="min-w-0 truncate text-xs text-fg">{handle}</span>
    </span>
  );
}

/**
 * Target cell — for role/block events the affected user (display name or
 * email); for login events the IP; otherwise the entity/target type or em-dash.
 */
function TargetCell({ event }: { event: AuditEvent }) {
  const m = event.metadata;
  let value: string | undefined;
  if (event.action === "login_success" || event.action === "login_failed") {
    value = m?.ip;
  } else if (event.action === "logout_success") {
    value = undefined;
  } else {
    value = m?.target_display_name || m?.target_email || event.target_type || event.entity_type;
  }
  if (!value) return <span className="text-fg-dim">—</span>;
  return (
    <span className="block truncate text-xs text-fg-muted" title={value}>
      {value}
    </span>
  );
}

/** 18px initial avatar from a label's first character. */
function InitialAvatar({ label }: { label: string }) {
  const ch = label.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className="inline-grid size-[18px] shrink-0 place-items-center rounded-full text-[9px] font-medium uppercase text-fg"
      style={{ background: "linear-gradient(var(--accent-soft), var(--bg-elev-3))" }}
    >
      {ch}
    </span>
  );
}

/**
 * `Custom range ▾` — a Popover with two native date inputs (from / to). Apply
 * is enabled only for a valid, non-inverted range. Local draft state is seeded
 * from the active range each time the popover opens.
 */
// `yyyy-mm-dd` <-> local Date helpers. We parse at local midnight so the
// calendar day a user clicks matches the `yyyy-mm-dd` string (no UTC drift).
function ymdToDate(ymd: string): Date | undefined {
  if (!ymd) return undefined;
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}
function dateToYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function CustomRangePicker({
  value,
  onApply,
}: {
  value: DateRange | null;
  onApply: (range: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(value?.from ?? "");
  const [to, setTo] = useState(value?.to ?? "");

  const onOpenChange = (next: boolean) => {
    if (next) {
      // Seed the draft from the active range whenever the popover opens.
      setFrom(value?.from ?? "");
      setTo(value?.to ?? "");
    }
    setOpen(next);
  };

  // Calendar <-> input sync. The calendar drives both fields; typing in a field
  // re-seeds the calendar via the derived `selected` range below.
  const selected: RDPDateRange | undefined = from
    ? { from: ymdToDate(from), to: ymdToDate(to) || undefined }
    : undefined;

  const onSelectRange = (range: RDPDateRange | undefined) => {
    setFrom(range?.from ? dateToYmd(range.from) : "");
    setTo(range?.to ? dateToYmd(range.to) : range?.from ? dateToYmd(range.from) : "");
  };

  const valid = from !== "" && to !== "" && from <= to;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          size="xs"
          variant="outline"
          className="whitespace-nowrap px-2.5"
          aria-label="Set a custom date range"
        >
          <CalendarDays className="size-3" aria-hidden="true" />
          Custom range
          <ChevronRight className="size-3 rotate-90" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      {/* Grafana-style: range calendar on the left, From/To + Apply on the right. */}
      <PopoverContent align="start" className="flex w-auto gap-0 p-0">
        <div className="border-r border-border-subtle">
          <Calendar
            mode="range"
            selected={selected}
            onSelect={onSelectRange}
            defaultMonth={ymdToDate(from)}
            numberOfMonths={1}
          />
        </div>
        <div className="flex w-[220px] flex-col gap-3 p-4">
          <p className="text-sm font-medium text-fg-strong">Absolute time range</p>
          <div className="space-y-1.5">
            <Label htmlFor="audit-range-from" className="text-xs text-fg-muted">
              From
            </Label>
            <Input
              id="audit-range-from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-range-to" className="text-xs text-fg-muted">
              To
            </Label>
            <Input
              id="audit-range-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!valid}
              onClick={() => {
                onApply({ from, to });
                setOpen(false);
              }}
            >
              Apply time range
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  onPrev,
  onNext,
  onPageSize,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onPageSize: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-1 flex-wrap">
      <div className="flex items-center gap-2">
        <Button size="xs" variant="outline" disabled={page <= 1} onClick={onPrev}>
          ← Previous
        </Button>
        <span className="caption text-fg-muted">
          Page {page} of {pageCount}
        </span>
        <Button size="xs" variant="outline" disabled={page >= pageCount} onClick={onNext}>
          Next →
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <span className="caption text-fg-dim">Per page</span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
          <SelectTrigger size="sm" className="h-7 w-[68px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="caption font-mono tabular-nums text-fg-muted">{total.toLocaleString()} total</span>
      </div>
    </div>
  );
}
