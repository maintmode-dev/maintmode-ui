"use client";

import type * as React from "react";

import { cn } from "@/shared/ui/lib/cn";
import { formatUtc } from "@/shared/ui/lib/format";
import { type AuditEvent, type AuditFieldChange, auditActorFull } from "@/domain/audit/audit-log";

/** `name · email` when both differ, else whichever single value exists. */
function joinNameEmail(name?: string, email?: string): string | undefined {
  const n = name?.trim();
  const e = email?.trim();
  if (n && e && n !== e) return `${n} · ${e}`;
  return n || e || undefined;
}

/**
 * Per-action expanded detail, driven by the structured `metadata` payload:
 * login → IP / User agent / Session (+ Failure reason on `login.failed`);
 * logout → Session / Kind; `maintenance.*` / `maintenance_step.*` → Maintenance
 * title + a `changes` diff; role/block events → Target + a role diff
 * (added/removed) or the assigned role set. Falls back to the one-line `details`
 * summary + timestamp when no metadata is present.
 *
 * Shared by both the global audit log (`/admin/audit-log`) and the
 * per-maintenance audit page so the expand grid is identical in both.
 */
export function AuditExpandedDetail({ event }: { event: AuditEvent }) {
  const m = event.metadata;
  const rows: { label: string; value: React.ReactNode }[] = [];

  // Who performed the action — always first, as a single `name · email` line
  // (one or the other when only one is known; "Unknown" when the backend
  // recorded no actor — RUK-174).
  rows.push({ label: "Actor", value: auditActorFull(event) });

  if (event.action === "login.success" || event.action === "login.failed") {
    if (m?.ip) rows.push({ label: "IP", value: m.ip });
    if (m?.user_agent) rows.push({ label: "User agent", value: m.user_agent });
    if (m?.session_id) rows.push({ label: "Session", value: m.session_id });
    if (m?.failure_reason)
      rows.push({ label: "Reason", value: <span className="text-destructive-fg">{m.failure_reason}</span> });
  } else if (event.action === "logout.success") {
    if (m?.session_id) rows.push({ label: "Session", value: m.session_id });
    if (m?.logout_kind) rows.push({ label: "Kind", value: m.logout_kind });
  } else if (event.action.startsWith("maintenance")) {
    // Maintenance / step lifecycle — title snapshot + per-field diff on update.
    if (m?.maint_title) rows.push({ label: "Maintenance", value: m.maint_title });
    if (m?.changes?.length) rows.push({ label: "Changes", value: <ChangeDiff changes={m.changes} /> });
  } else {
    // Role / block events — target identity as a single `name · email` line.
    const target = joinNameEmail(m?.target_display_name, m?.target_email) || event.entity_id;
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

/** Per-field before/after diff for `maintenance.updated` — `field: old → new`. */
function ChangeDiff({ changes }: { changes: AuditFieldChange[] }) {
  return (
    <span className="flex flex-col gap-1">
      {changes.map((c, i) => (
        <span key={`${c.field}-${i}`} className="inline-flex flex-wrap items-center gap-1">
          <span className="text-fg-dim">{c.field ?? "—"}:</span>
          <span className="text-destructive-fg line-through">{c.old || "∅"}</span>
          <span className="text-fg-dim">→</span>
          <span className="text-[var(--status-completed-fg)]">{c.new || "∅"}</span>
        </span>
      ))}
    </span>
  );
}
