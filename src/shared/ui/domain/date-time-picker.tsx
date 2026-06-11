"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";

import { cn } from "@/shared/ui/lib/cn";
import { Button } from "@/shared/ui/shadcn/button";
import { Calendar } from "@/shared/ui/shadcn/calendar";
import { Input } from "@/shared/ui/shadcn/input";
import { Label } from "@/shared/ui/shadcn/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/shadcn/popover";

/**
 * Single date + time picker — the shadcn Calendar (in a Popover) plus a native
 * time input, composed per the shadcn date-time recipe. Used everywhere a
 * date+time is picked (e.g. maintenance Planned start) so the calendar UI
 * matches the audit-log range picker.
 *
 * Value contract mirrors `<input type="datetime-local">`: a local
 * `"YYYY-MM-DDTHH:MM"` string (empty when unset), so it's a drop-in swap.
 */
export interface DateTimePickerProps {
  id?: string;
  /** Local `YYYY-MM-DDTHH:MM` (or "" when unset). */
  value: string;
  onChange: (value: string) => void;
  "aria-invalid"?: boolean;
  "aria-label"?: string;
}

function splitLocal(value: string): { date?: Date; time: string } {
  const [ymd, hm] = value.split("T");
  if (!ymd) return { time: "" };
  const [y, m, d] = ymd.split("-").map(Number);
  const date = y && m && d ? new Date(y, m - 1, d) : undefined;
  return { date, time: hm ?? "" };
}

function dateToYmd(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function joinLocal(ymd: string, time: string): string {
  if (!ymd) return "";
  return `${ymd}T${time || "00:00"}`;
}

function formatTrigger(value: string): string {
  const { date, time } = splitLocal(value);
  if (!date) return "Pick a date & time";
  const label = date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
  return time ? `${label} · ${time}` : label;
}

export function DateTimePicker({
  id,
  value,
  onChange,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const { date, time } = splitLocal(value);

  const onSelectDate = (next: Date | undefined) => {
    if (!next) return;
    onChange(joinLocal(dateToYmd(next), time));
  };
  const onTime = (t: string) => {
    onChange(joinLocal(date ? dateToYmd(date) : dateToYmd(new Date()), t));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-invalid={ariaInvalid}
          aria-label={ariaLabel}
          className={cn("w-full justify-start font-normal tabular-nums", !date && "text-fg-muted")}
        >
          <CalendarDays className="size-3.5 text-fg-dim" aria-hidden="true" />
          {formatTrigger(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar mode="single" selected={date} onSelect={onSelectDate} defaultMonth={date} />
        <div className="flex items-center gap-2 border-t border-border-subtle p-3">
          <Label htmlFor={id ? `${id}-time` : undefined} className="text-xs text-fg-muted">
            Time
          </Label>
          <Input
            id={id ? `${id}-time` : undefined}
            type="time"
            value={time}
            onChange={(e) => onTime(e.target.value)}
            className="h-8 w-[120px] text-xs"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
