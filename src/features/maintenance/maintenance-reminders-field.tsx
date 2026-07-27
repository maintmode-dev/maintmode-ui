"use client";

import { X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/shadcn/select";
import { formatDateTime } from "@/shared/ui/lib/format";
import { cn } from "@/shared/ui/lib/cn";
import {
  MAX_OFFSET_MINUTES,
  MAX_REMINDERS,
  offsetLabel,
  REMINDER_PRESETS,
  REMINDER_UNITS,
  toFireAt,
  toOffsetMinutes,
  type ReminderUnit,
} from "@/domain/maintenance/reminders";

/** `MAX_OFFSET_MINUTES` in days, for operator-facing copy. */
const MAX_OFFSET_DAYS = MAX_OFFSET_MINUTES / (24 * 60);

export interface MaintenanceRemindersFieldProps {
  /** Selected offsets in minutes before the planned start. */
  value: number[];
  onChange: (offsets: number[]) => void;
  /** Planned start (UTC ISO) — resolves each offset to its absolute send time. */
  plannedStart: string;
  /** Operator's IANA zone, for the "fires at" preview. */
  zone: string;
}

/**
 * "When to notify" — advance reminders for a maintenance window (RUK-216).
 *
 * Offsets, not instants, are what the operator picks and what this holds; the
 * BFF mapper resolves them against `planned_start`. That's also why changing the
 * start needs no work here: the same offsets simply resolve to new instants, and
 * the preview follows automatically.
 *
 * Each selection previews its resolved absolute time in the operator's zone —
 * "1 day before" alone hides the moment the message actually goes out, and this
 * whole feature is about *when*.
 */
export function MaintenanceRemindersField({
  value,
  onChange,
  plannedStart,
  zone,
}: MaintenanceRemindersFieldProps) {
  const [customValue, setCustomValue] = useState("");
  const [customUnit, setCustomUnit] = useState<ReminderUnit>("hours");
  const [customError, setCustomError] = useState<string | null>(null);

  const atCap = value.length >= MAX_REMINDERS;
  // Sorted for display only (longest lead time first); the stored order is the
  // operator's selection order and the backend sorts by fire_at on read anyway.
  const selected = [...value].sort((a, b) => b - a);

  function toggle(minutes: number) {
    if (value.includes(minutes)) {
      onChange(value.filter((m) => m !== minutes));
      return;
    }
    if (atCap) return;
    onChange([...value, minutes]);
  }

  function addCustom() {
    const minutes = toOffsetMinutes(customValue, customUnit);
    if (minutes === null) {
      setCustomError(`Enter a whole number of ${customUnit}, at most ${MAX_OFFSET_DAYS} days before.`);
      return;
    }
    if (value.includes(minutes)) {
      setCustomError(`${offsetLabel(minutes)} is already added.`);
      return;
    }
    if (atCap) {
      setCustomError(`At most ${MAX_REMINDERS} reminders.`);
      return;
    }
    onChange([...value, minutes]);
    setCustomValue("");
    setCustomError(null);
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-1.5">
        {REMINDER_PRESETS.map((preset) => {
          const active = value.includes(preset.minutes);
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => toggle(preset.minutes)}
              aria-pressed={active}
              disabled={!active && atCap}
              className={cn(
                "cursor-pointer rounded-sm border px-2 py-[3px] text-xs transition-colors",
                "disabled:cursor-not-allowed disabled:opacity-50",
                active
                  ? "border-border bg-bg-elev-3 font-medium text-fg"
                  : "border-border-subtle text-fg-muted hover:border-border hover:text-fg",
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-start gap-1.5">
        <Input
          value={customValue}
          onChange={(e) => {
            setCustomValue(e.target.value);
            setCustomError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // The field lives inside the maintenance <form>; Enter here means
              // "add this reminder", never "submit the draft".
              e.preventDefault();
              addCustom();
            }
          }}
          inputMode="numeric"
          placeholder="Custom"
          aria-label="Custom reminder amount"
          className="h-7 w-20 text-xs"
        />
        <Select value={customUnit} onValueChange={(v) => setCustomUnit(v as ReminderUnit)}>
          {/* The trigger sizes itself off `data-[size=...]` attribute selectors
              (`h-9` default, `h-8` for sm), and those outrank a plain `h-7` —
              so the height must be set through the same variant to win, or the
              control renders taller than the 28px input and Add button beside
              it. */}
          <SelectTrigger
            size="sm"
            aria-label="Custom reminder unit"
            className="w-[104px] text-xs data-[size=sm]:h-7"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REMINDER_UNITS.map((unit) => (
              <SelectItem key={unit.id} value={unit.id}>
                {unit.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          onClick={addCustom}
          disabled={atCap}
          className="h-7 px-2.5 text-xs"
        >
          Add
        </Button>
      </div>

      {/* Announced: the error appears after an Add press, while focus stays on
          the button, so without a live region a screen reader never hears it. */}
      {customError ? (
        <p role="alert" className="text-xs text-destructive">
          {customError}
        </p>
      ) : null}

      {selected.length > 0 ? (
        <ul className="space-y-1 pt-0.5">
          {selected.map((minutes) => {
            const fireAt = toFireAt(plannedStart, minutes);
            return (
              <li
                key={minutes}
                className="flex items-center gap-2 rounded-sm border border-border-subtle bg-bg-elev-3 px-2 py-1 text-xs"
              >
                {/* Fixed-width label column so the times form a single
                    scannable edge — otherwise "15 minutes before" pushes its
                    timestamp ~9px right of every other row's. */}
                <span className="w-[104px] shrink-0 font-medium text-fg">{offsetLabel(minutes)}</span>
                <span className="truncate text-fg-muted">
                  {fireAt ? formatDateTime(fireAt, zone) : "Set a start time"}
                </span>
                {/* Matches ResourceChip's remove affordance: a real icon in a
                    grid-centred box, not a bare glyph. The glyph gave a 9×16px
                    hit target and leaked "✕" into page search and copy-paste. */}
                <button
                  type="button"
                  onClick={() => toggle(minutes)}
                  aria-label={`Remove ${offsetLabel(minutes)}`}
                  className="ml-auto inline-grid size-4 shrink-0 cursor-pointer place-items-center rounded-xs text-fg-muted hover:bg-bg-elev-4 hover:text-fg"
                >
                  <X className="size-3" aria-hidden={true} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
