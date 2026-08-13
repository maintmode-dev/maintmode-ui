"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/shared/ui/shadcn/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/ui/shadcn/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/shadcn/popover";
import { cn } from "@/shared/ui/lib/cn";

export interface MultiSelectOption {
  value: string;
  label: ReactNode;
  /** Optional searchable text (defaults to stringified label). */
  searchValue?: string;
  /** Optional secondary line shown under the label. */
  description?: ReactNode;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  /** Currently-selected values. */
  value: string[];
  onChange: (value: string[]) => void;
  /** Trigger text when nothing is selected. */
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /**
   * Message announced to assistive tech when the options failed to LOAD, as
   * opposed to legitimately being none. The visible copy still travels through
   * `emptyText`.
   *
   * **The caller owns the pending precedence.** This component cannot see query
   * state, so it announces whatever it is given: pass `undefined` while the
   * query is pending, even if it is also in error. A refetching failed query
   * reports `isPending` and `isError` together, and since `emptyText` gives
   * pending precedence, feeding this prop on `isError` alone makes the popover
   * read "Loading…" while the live region announces a failure — the two
   * audiences told different things about the same moment. That is the
   * invariant this prop is easiest to get wrong on; it has been broken once.
   *
   * A separate prop rather than a flag on `emptyText` because the two answer
   * different questions. `emptyText` renders through cmdk's `CommandEmpty`,
   * which appears whenever the *filter* matches nothing and carries
   * `role="presentation"` — so it says "no rows to show" and says it silently.
   * This one is driven by query state and is announced. See the live region
   * below.
   */
  errorText?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

/** Prose label → a selector-safe testid suffix ("Notify channels" → "notify-channels"). */
function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Searchable multi-select built on the same Popover + Command primitives as
 * `Combobox`, but toggling a set of values instead of picking one. The popover
 * stays open across toggles so several items can be added in one pass; the
 * trigger summarizes the selection count. Selected chips are rendered by the
 * caller (the form owns the chip styling — resource chips vs. channel chips).
 */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No results.",
  errorText,
  disabled,
  className,
  ariaLabel,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const selectedSet = new Set(value);

  const toggle = (next: string) => {
    onChange(selectedSet.has(next) ? value.filter((v) => v !== next) : [...value, next]);
  };

  const summary = value.length === 0 ? placeholder : `${value.length} selected`;

  return (
    <>
      {/* Load failures reach assistive tech from HERE, not from `emptyText`.
          `CommandEmpty` renders `role="presentation"` with no live semantics,
          so a screen-reader user opening a failed picker hears an empty
          listbox — the same "a failure looks like an empty roster" defect the
          visible copy fixes, one channel over.

          Three properties, each load-bearing:

          - OUTSIDE `PopoverContent`, which is Portal-mounted with no
            `forceMount`. A region rendered in there would enter the tree with
            its text already inside it, and a live region is announced on
            MUTATION, not on arrival — it would be silent. Kept here, it is
            mounted for the component's lifetime and the text lands as a change.
            Same reasoning as the always-mounted error node in
            `src/features/admin/users-management-page.tsx`.
          - `role="alert"`, not `status`. The repo downgrades to `status` when a
            message is merely present on load; this one is raised by an operator
            action (opening the picker), which is the case the convention
            reserves `alert` for. Polite announcements queued behind the
            popover's own focus-move chatter also get dropped.
          - Gated on `open`, so an optional field's failure does not interrupt
            someone filling in the rest of the form. Re-opening a still-broken
            picker announces again, which is wanted.

          The testid is derived from `ariaLabel` because a form can hold several
          MultiSelects — a fixed literal would make every `getByTestId` ambiguous.
          `ariaLabel` is optional, so an unlabelled picker gets NO testid rather
          than a shared fallback: two of those would collide right back into the
          ambiguity this derivation exists to prevent, and silently, since the
          region still works. A picker that needs to be selected in a test needs
          an `ariaLabel` anyway — the trigger's accessible name comes from it. */}
      <span
        role="alert"
        // Redundant to `role="alert"` on paper, explicit on purpose: some
        // AT/browser pairings track the attribute more reliably than the
        // implicit role for a node whose text mutates in place, which is
        // exactly this node's whole job.
        aria-live="assertive"
        // Not decoration: this node matches `getByRole("alert")` even while
        // empty, because role queries do not filter on accessible name. So a
        // form rendering a MultiSelect alongside any other alert needs
        // `getAllByRole` or this testid — a singular `getByRole("alert")` there
        // fails with "found multiple elements". Nothing collides today (no
        // current alert-querying suite renders a MultiSelect), but the next one
        // to do so will hit it. Slugified because `ariaLabel` is prose and a raw
        // space needs quoting in a CSS attribute selector.
        data-testid={ariaLabel ? `multiselect-error-live-${slugify(ariaLabel)}` : undefined}
        className="sr-only"
      >
        {open && errorText ? errorText : ""}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-label={ariaLabel}
            aria-expanded={open}
            disabled={disabled}
            className={cn("w-full justify-between font-normal", className)}
          >
            <span className={cn("truncate", value.length === 0 && "text-fg-muted")}>{summary}</span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => {
                  const checked = selectedSet.has(option.value);
                  return (
                    <CommandItem
                      key={option.value}
                      value={option.searchValue ?? String(option.label)}
                      onSelect={() => toggle(option.value)}
                    >
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="truncate">{option.label}</span>
                        {option.description ? (
                          <span className="text-xs text-fg-muted truncate">{option.description}</span>
                        ) : null}
                      </div>
                      <Check
                        className={cn("ml-2 size-4 shrink-0", checked ? "opacity-100" : "opacity-0")}
                        aria-hidden="true"
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
