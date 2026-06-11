"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker";

import { cn } from "@/shared/ui/lib/cn";
import { buttonVariants } from "@/shared/ui/shadcn/button";

/**
 * Calendar — thin wrapper over `react-day-picker` (v10) themed with the app's
 * design tokens. No external stylesheet is imported; every part is restyled via
 * `classNames` so it matches the rest of the UI (and dark mode) automatically.
 *
 * `mode="range"` gives the Grafana-style range selection (start/middle/end days
 * highlighted as a continuous band). Adapted from the shadcn Calendar recipe.
 */
export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  const defaults = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        root: cn(defaults.root, "w-fit"),
        months: "flex flex-col sm:flex-row gap-2 relative",
        month: "flex flex-col gap-3",
        month_caption: "flex justify-center pt-1 relative items-center h-8",
        caption_label: "text-sm font-medium text-fg-strong",
        nav: "flex items-center justify-between absolute inset-x-0 top-0 h-8 px-1",
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "size-7 p-0 text-fg-muted hover:text-fg",
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "size-7 p-0 text-fg-muted hover:text-fg",
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "text-fg-dim w-9 font-normal text-[11px] uppercase tracking-wide",
        week: "flex w-full mt-1",
        day: "relative size-9 p-0 text-center text-sm focus-within:relative focus-within:z-20",
        outside: "text-fg-dim opacity-50",
        disabled: "text-fg-dim opacity-40",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...rest }) =>
          orientation === "left" ? (
            <ChevronLeft className="size-4" {...rest} />
          ) : (
            <ChevronRight className="size-4" {...rest} />
          ),
        DayButton: CalendarDayButton,
      }}
      {...props}
    />
  );
}

/**
 * Custom day button — reads the day's `modifiers` and paints the range band
 * directly on the button (not the cell), which is the reliable way to theme
 * react-day-picker v10: a `<td>` background doesn't render in a border-collapse
 * grid, and arbitrary `[&>button]` variants don't always compile. Static
 * utility strings here are guaranteed to be in the Tailwind output.
 */
function CalendarDayButton({ className, day, modifiers, ...props }: React.ComponentProps<typeof DayButton>) {
  const { selected, range_start, range_end, range_middle, today } = modifiers;
  const isEnd = range_start || range_end;
  const isBand = isEnd || range_middle || selected;
  void day;
  return (
    <button
      type="button"
      // Brand accent is `var(--accent)` (#6e7bff) — the bare `bg-accent`
      // utility maps to shadcn's muted accent, so the band uses the CSS vars
      // explicitly. Only non-band days get the elev-3 hover.
      className={cn(
        "size-9 rounded-md p-0 text-sm font-normal text-fg transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring",
        !isBand && "hover:bg-bg-elev-3",
        today && !selected && "border border-border-strong",
        range_middle && "rounded-none bg-[var(--accent-soft)] text-fg",
        range_start && "rounded-l-md rounded-r-none",
        range_end && "rounded-r-md rounded-l-none",
        isEnd && "bg-[var(--accent)] text-[var(--accent-fg)]",
        selected && !range_middle && !isEnd && "bg-[var(--accent)] text-[var(--accent-fg)]",
        className,
      )}
      {...props}
    />
  );
}
