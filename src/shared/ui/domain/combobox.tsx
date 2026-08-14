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

export interface ComboboxOption {
  value: string;
  label: ReactNode;
  /** Optional searchable text (defaults to stringified label). */
  searchValue?: string;
  /**
   * Optional secondary line shown under label. Pass a thunk to defer the work
   * to the moment the row actually renders — the popover's content is not
   * mounted while it is closed, so an expensive description costs nothing
   * until the user opens it. Note the thunk is *not* part of the search path
   * (see `value` below), so cmdk's filter never forces it to evaluate.
   */
  description?: ReactNode | (() => ReactNode);
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value?: string;
  onChange?: (value: string) => void;
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
   * in the component body.
   *
   * **Static UI copy only — never server text.** The `string` type is what
   * keeps this safe: pass a literal, not `error.message`, a backend `detail`,
   * or an HTTP status. Threading a server-supplied message through here is the
   * one change that would turn an accessibility affordance into a disclosure
   * vector, and it would look entirely reasonable in review.
   *
   * Twin of the identical prop on `MultiSelect` (`multi-select.tsx`). The two
   * are deliberately duplicated rather than extracted: two consumers do not pay
   * for a shared abstraction. Revisit if a third component needs it.
   */
  errorText?: string;
  disabled?: boolean;
  className?: string;
  /** Aria-label for the trigger when no value is selected. */
  ariaLabel?: string;
}

/** Prose label → a selector-safe testid suffix ("Approver" → "approver"). */
function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Renders an option's secondary line, resolving the thunk form lazily. This
 * runs only when the row itself renders, which is what lets a caller keep an
 * expensive per-option computation out of its own render pass.
 */
function ComboboxDescription({ description }: { description: ComboboxOption["description"] }) {
  const resolved = typeof description === "function" ? description() : description;
  if (!resolved) return null;
  return <span className="text-xs text-fg-muted truncate">{resolved}</span>;
}

/**
 * Searchable single-select combobox. Used by Cancel dialog reason picker,
 * resource picker, etc. Built on shadcn's Popover + Command.
 */
export function Combobox({
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
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <>
      {/* Load failures reach assistive tech from HERE, not from `emptyText`:
          `CommandEmpty` is `role="presentation"` with no live semantics, so a
          screen-reader user opening a failed picker hears an empty listbox — a
          failed load indistinguishable from an empty list, which is the defect
          this exists to close.

          A port of the same region in `multi-select.tsx`. Why it sits outside
          `PopoverContent`, why `alert` rather than `status`, why the `open`
          gate and the explicit `: ""` — all four are argued there, and are not
          restated here so the two cannot drift into disagreeing.

          What is specific to THIS component:

          The return is wrapped in a fragment; `Combobox` previously rendered a
          single `<Popover>` root, so its five call sites now lay out two
          children where they laid out one. Two separate properties of
          `sr-only` make that safe, and both are needed — checked against this
          repo's compiled Tailwind v4 output, not assumed:

          - `position: absolute` takes the node out of flow, so it is not a flex
            item and creates no grid track. That covers `timezone-card.tsx`,
            whose row is `flex flex-wrap items-center gap-3` — an in-flow
            sibling there would have collected a `gap-3` of its own.
          - `margin: -1px` is what covers the `space-y-1.5` parents (`Field`
            here, and `cancel-maintenance-dialog.tsx`). Out-of-flow is NOT
            enough for those: `space-y` is margin-based, and margins do apply to
            absolutely-positioned boxes. The cascade saves it — Tailwind emits
            `:where(.space-y-1\.5 > :not(:last-child))`, and `:where()` has zero
            specificity, so `.sr-only`'s own margin wins.

          Both are spelled out because the shorter version ("it's absolute, so
          it's free") is true for one site and would license adding an `sr-only`
          sibling somewhere it genuinely is not.

          The testid prefix is `combobox-`, not the `multiselect-` of the
          original: a form renders both, and a region that misnames its own
          component sends the next reader to the wrong file. It derives from
          `ariaLabel`, and an unlabelled picker gets NO testid rather than a
          shared fallback — two of those would collide back into the ambiguity
          the derivation prevents, silently, since the region still works.
          Reachable today: the dev showcase renders an unlabelled `Combobox`. */}
      <span
        role="alert"
        // Redundant to `role="alert"` on paper, explicit on purpose: some
        // AT/browser pairings track the attribute more reliably than the
        // implicit role for a node whose text mutates in place, which is
        // exactly this node's whole job.
        aria-live="assertive"
        // This node matches `getByRole("alert")` even while empty — role
        // queries do not filter on accessible name. A suite rendering a
        // `Combobox` alongside another alert needs `getAllByRole` or a scoped
        // selector; `notify-channel-create-dialog.test.tsx` was adjusted for
        // exactly this when the region landed.
        data-testid={ariaLabel ? `combobox-error-live-${slugify(ariaLabel)}` : undefined}
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
            <span className={cn("truncate", !selected && "text-fg-muted")}>
              {selected ? selected.label : placeholder}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.searchValue ?? String(option.label)}
                    onSelect={() => {
                      onChange?.(option.value);
                      setOpen(false);
                    }}
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="truncate">{option.label}</span>
                      <ComboboxDescription description={option.description} />
                    </div>
                    <Check
                      className={cn(
                        "ml-2 size-4 shrink-0",
                        option.value === value ? "opacity-100" : "opacity-0",
                      )}
                      aria-hidden="true"
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
