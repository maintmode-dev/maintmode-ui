"use client";

import { useState } from "react";

import type { DateRange as RDPDateRange } from "react-day-picker";

import { Button } from "@/shared/ui/shadcn/button";
import { Calendar } from "@/shared/ui/shadcn/calendar";
import { Input } from "@/shared/ui/shadcn/input";
import { Label } from "@/shared/ui/shadcn/label";
import { PopoverContent } from "@/shared/ui/shadcn/popover";

/** Inclusive custom date window, `yyyy-mm-dd` strings from `<input type=date>`. */
export interface AuditDateRange {
  from: string;
  to: string;
}

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

/**
 * Body of the `Custom range ▾` popover — two native date inputs (from / to)
 * beside a range calendar. Apply is enabled only for a valid, non-inverted
 * range. Local draft state is seeded from the active range on mount, which is
 * also each time the popover opens: Radix unmounts closed content, so this
 * component's lifetime *is* the open state.
 *
 * Lives in its own module so the page can `dynamic()` it. `react-day-picker` +
 * `date-fns` are 18.9 KB gzip that the median audit visit never needs — the
 * page defaults to preset chips with no custom range, and the calendar only
 * exists behind this popover. Only the content splits; the trigger button stays
 * on the page, so the filter row's geometry is unchanged at first paint.
 */
export function AuditCustomRangePicker({
  value,
  onApply,
  onCancel,
}: {
  value: AuditDateRange | null;
  onApply: (range: AuditDateRange) => void;
  onCancel: () => void;
}) {
  const [from, setFrom] = useState(value?.from ?? "");
  const [to, setTo] = useState(value?.to ?? "");

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
    // Grafana-style: range calendar on the left, From/To + Apply on the right.
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
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" disabled={!valid} onClick={() => onApply({ from, to })}>
            Apply time range
          </Button>
        </div>
      </div>
    </PopoverContent>
  );
}
