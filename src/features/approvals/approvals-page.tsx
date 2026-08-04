"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

import { useQueryClient } from "@tanstack/react-query";

import type { ApprovalRow } from "@/domain/maintenance/approval";
import type { MaintenanceDetail } from "@/domain/maintenance/maintenance";
import { useTimezone } from "@/features/_shared/timezone/use-timezone";
import { maintenanceDetailKey } from "@/features/maintenance/queries/use-maintenance-detail-query";
import { ImpactBadge } from "@/shared/ui/domain/impact-badge";
import { Button } from "@/shared/ui/shadcn/button";
import {
  ApprovalsEmpty,
  ApprovalsError,
  ApprovalsLoading,
  ApprovalsPageEmptied,
  DetailsForbidden,
} from "@/shared/ui/states";
import { bffFetch, BffError } from "@/features/_shared/api/bff-fetch";
import { formatDate, formatRange, formatRelative, formatUtc } from "@/shared/ui/lib/format";
import { cn } from "@/shared/ui/lib/cn";

import { APPROVALS_PAGE_SIZE, useApprovalsQuery } from "./queries/use-approvals-query";

// "Requested", not "Waiting": the cell shows `created_at`, and the backend has
// no submitted-for-review stamp to derive an actual wait from. Under a "Waiting"
// header the number reads as time-in-queue, which it is not — visibly so once
// the edited sub-line lands, where "4h ago / edited just now" contradict.
const COLUMNS = ["Maintenance", "Window", "Impact", "Scope", "Requested by", "Requested"];

/**
 * Loaded on demand: the peek is behind a click, but statically imported it
 * shipped in the page's first-load payload — 12 KB gzip against the queue
 * page's own 1 KB, downloaded and parsed by every reviewer including those who
 * never open a row.
 *
 * `ssr: false` costs nothing: `selectedId` starts null, so the sheet is absent
 * from the prerendered HTML either way (verified against the build output).
 * The chunk fetch moves into the click, which the hover prefetch below covers.
 */
const MaintenanceQuickSheet = dynamic(
  () => import("@/features/maintenance/maintenance-quick-sheet").then((m) => m.MaintenanceQuickSheet),
  { ssr: false },
);

/**
 * `/approvals` — the personal queue of drafts awaiting this reviewer (RUK-215).
 *
 * The queue is navigational: a row opens the same `MaintenanceQuickSheet` the
 * calendar uses, and the sheet carries both the link to the full page and the
 * Approve action. Nothing about approving is reimplemented here.
 *
 * No status column: the backend omits `status` from this response because the
 * listing is drafts by definition, and a one-valued column would be noise.
 */
export function ApprovalsPage() {
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useApprovalsQuery(offset);

  const page = query.data;
  const total = page?.total ?? 0;
  const hasPages = total > APPROVALS_PAGE_SIZE;
  // A later page can drain while the reviewer stands on it — approving happens
  // in the quick-sheet, without navigating away. The queue as a whole is not
  // empty in that case, so this is a distinct state from "nothing is waiting".
  const pageDrained = page !== undefined && page.items.length === 0 && offset > 0;

  return (
    <div className="mx-auto max-w-[1120px] p-6 space-y-4">
      <header className="flex items-center flex-wrap gap-3">
        <div className="flex-1 min-w-[200px]">
          <h1 className="h1">Awaiting my approval</h1>
          {/* On a drained page the count would read "50 pending" directly above
              "this page is empty now" — true of the queue, but it reads as a
              contradiction. Point at the rest of the queue instead. */}
          <p className="caption mono mt-1 text-fg-muted" data-testid="approvals-count">
            {query.isPending
              ? "Loading…"
              : pageDrained
                ? `${total} pending elsewhere in the queue`
                : `${total} pending`}
          </p>
        </div>
      </header>

      {/* The whole result area is a live region: on this page states swap
          without navigation — approving from the peek can drain the page and
          replace the table — so a screen reader would otherwise never learn
          the view changed under it. */}
      <div role="status" aria-live="polite">
        {query.isPending ? (
          <ApprovalsLoading />
        ) : query.isError ? (
          // A 403 means this account's roles don't carry maintenance.approve.
          // Retrying can't change that, so it gets the no-CTA state rather than
          // the generic error with its "try again" button.
          query.error instanceof BffError && query.error.status === 403 ? (
            <DetailsForbidden />
          ) : (
            <ApprovalsError onRetry={() => query.refetch()} />
          )
        ) : pageDrained ? (
          <ApprovalsPageEmptied onBackToStart={() => setOffset(0)} />
        ) : page && page.items.length === 0 ? (
          <ApprovalsEmpty />
        ) : page ? (
          <>
            <ApprovalsTable rows={page.items} onOpen={(row) => setSelectedId(row.id)} />
            {hasPages ? (
              <Pagination
                offset={offset}
                total={total}
                shown={page.items.length}
                onPrev={() => setOffset((o) => Math.max(0, o - APPROVALS_PAGE_SIZE))}
                onNext={() => setOffset((o) => o + APPROVALS_PAGE_SIZE)}
              />
            ) : null}
          </>
        ) : null}
      </div>

      <MaintenanceQuickSheet
        maintenanceId={selectedId}
        open={selectedId !== null}
        onOpenChange={(open) => !open && setSelectedId(null)}
      />
    </div>
  );
}

function ApprovalsTable({ rows, onOpen }: { rows: ApprovalRow[]; onOpen: (row: ApprovalRow) => void }) {
  const { zone } = useTimezone();
  const queryClient = useQueryClient();

  /**
   * Warm the row on hover so the click has nothing left to wait for. Two costs
   * hide behind that click — fetching the sheet's chunk and fetching the
   * maintenance detail — and pointer travel is usually long enough to cover
   * both. Cheap to be wrong: an unused prefetch is one cached GET.
   */
  const prefetch = (id: string) => {
    void import("@/features/maintenance/maintenance-quick-sheet");
    void queryClient.prefetchQuery({
      queryKey: maintenanceDetailKey(id),
      queryFn: () => bffFetch<MaintenanceDetail>(`/api/maintenance/${encodeURIComponent(id)}`),
      staleTime: 15_000,
    });
  };

  return (
    <div className="bg-bg-elev-1 border border-border-subtle rounded-md overflow-hidden">
      <table
        className="w-full text-left text-sm table-fixed"
        aria-label="Maintenances awaiting your approval"
      >
        <colgroup>
          <col />
          <col className="w-[22%]" />
          <col className="w-32" />
          <col className="w-24" />
          <col className="w-[18%]" />
          <col className="w-28" />
        </colgroup>
        <thead className="bg-bg-elev-2 border-b border-border-subtle">
          <tr>
            {COLUMNS.map((h) => (
              <th
                key={h}
                scope="col"
                className="px-3 py-2 text-2xs font-semibold uppercase tracking-[0.08em] text-fg-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-border-subtle last:border-b-0 hover:bg-bg-row-hover cursor-pointer h-14"
              onClick={() => onOpen(row)}
              onMouseEnter={() => prefetch(row.id)}
            >
              <td className="px-3 py-2.5 font-medium text-fg-strong truncate">{row.title || "—"}</td>
              <td className="px-3 py-2.5 text-fg-muted text-xs tabular-nums">{formatWindow(row, zone)}</td>
              <td className="px-3 py-2.5">
                <ImpactBadge impact={row.impact} size="xs" />
              </td>
              <td className="px-3 py-2.5 text-fg-muted text-xs">
                {row.scope === "global" ? "Global" : "Resource"}
              </td>
              <td
                className={cn(
                  "px-3 py-2.5 text-xs truncate",
                  row.created_by ? "text-fg-muted" : "text-fg-muted italic",
                )}
              >
                {row.created_by ?? "Unknown user"}
              </td>
              <td className="px-3 py-2.5 text-fg-muted text-xs">
                <span title={formatUtc(row.created_at)}>{formatRelative(row.created_at)}</span>
                <EditedStamp row={row} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Edits within this window of creation are treated as the author still
 * assembling the draft, not as a change a reviewer could have missed.
 *
 * Without a floor the stamp fires on nearly every row — a create is routinely
 * followed within seconds by the edit that fills the draft in (the backend
 * touches `updated_at` on any write), and a marker present everywhere is read
 * as decoration. The exact number is a judgement call, not a contract: five
 * minutes covers "finished typing it in" without swallowing a revision made
 * after someone had a chance to look.
 */
const EDIT_GRACE_MS = 5 * 60_000;

/**
 * "edited …" sub-line under the waiting time.
 *
 * Scope note: this says the record CHANGED, not what changed, who changed it,
 * or that it was changed in response to review. The wire carries only
 * `updated_at` — no author, no diff — and the backend has no request-changes
 * transition at all, so a stronger claim would be invented here rather than
 * observed. The tooltip stays literal ("Updated <stamp>") for the same reason:
 * a reviewer acts on it by opening the row, which is the point.
 */
function EditedStamp({ row }: { row: ApprovalRow }) {
  const updated = row.updated_at;
  if (!updated) return null;

  // Both stamps come from the same backend clock, so comparing them needs no
  // reference to the viewer's — unlike `formatRelative`, which is against `now`.
  const createdMs = Date.parse(row.created_at);
  const updatedMs = Date.parse(updated);
  if (Number.isNaN(createdMs) || Number.isNaN(updatedMs)) return null;
  if (updatedMs - createdMs < EDIT_GRACE_MS) return null;

  // Colour note: `fg-dim` would read as the more secondary of the two lines,
  // but at 11px it measures 3.4:1 — under WCAG AA for body text. The
  // `text-2xs fg-dim` pairs elsewhere in this codebase are all uppercase
  // semibold headings, held to 3:1 instead; this is prose and does not qualify.
  return (
    <span className="block text-2xs text-fg-muted" title={`Updated ${formatUtc(updated)}`}>
      edited {formatRelative(updated)}
    </span>
  );
}

/**
 * Window cell. The branch is not optional: `formatRange` takes two non-nullable
 * strings, while an open-ended period reaches us as `end: undefined` (the mapper
 * having stripped the backend's year-1 zero value), so the two cases must be
 * formatted separately rather than by passing a maybe-undefined through.
 */
function formatWindow(row: ApprovalRow, zone: string): string {
  const day = formatDate(row.start, zone);
  return row.end === undefined ? `${day} · open-ended` : `${day} · ${formatRange(row.start, row.end, zone)}`;
}

function Pagination({
  offset,
  total,
  shown,
  onPrev,
  onNext,
}: {
  offset: number;
  total: number;
  /** Rows actually on screen — not the page size. See the range comment below. */
  shown: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  // Derived from the rows present, not from `offset + PAGE_SIZE`. A page can
  // hold fewer rows than it was sized for once approvals drain it, and the
  // arithmetic version then claims a range that runs backwards ("51–50 of 50").
  const to = offset + shown;
  const from = Math.min(offset + 1, to);
  return (
    <nav aria-label="Approvals pagination" className="flex items-center justify-between">
      <p className="caption text-fg-muted tabular-nums" role="status">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button size="xs" variant="outline" onClick={onPrev} disabled={offset === 0}>
          Previous
        </Button>
        <Button size="xs" variant="outline" onClick={onNext} disabled={to >= total}>
          Next
        </Button>
      </div>
    </nav>
  );
}
