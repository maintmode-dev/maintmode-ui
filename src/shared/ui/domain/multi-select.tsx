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
  /**
   * Lift the search box's text to the caller, so it can fetch `options` from the
   * server instead of filtering a page it already holds.
   *
   * Why this exists: without it the search text never leaves this component, and
   * cmdk filters whatever `options` happen to be loaded. That silently caps a
   * picker at its first page — measured on the maintenance form, 200 of 5781
   * resources and 200 of 10203 people were reachable, and the rest could not be
   * found by typing at all (RUK-251, RUK-266).
   *
   * Passing it turns OFF cmdk's own filtering (`shouldFilter={false}`): the
   * server has already decided what matches, and a second client-side pass over
   * that answer can only remove rows the server deliberately returned.
   *
   * Omit it and the component keeps filtering client-side exactly as before —
   * right for small, fully-loaded lists (cancel reasons).
   */
  onSearchChange?: (search: string) => void;
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
  onSearchChange,
  disabled,
  className,
  ariaLabel,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  // Lifted out of cmdk's store so `CommandEmpty` can tell "the filter matched
  // nothing" from "there is nothing to filter" — the two facts cmdk collapses
  // into one `filtered.count === 0`. Controlled on `CommandInput`, NOT on the
  // `Command` root: the root's identically-named pair is the *selected item*,
  // and wiring the query there leaves `state.search` empty forever (the feature
  // silently does nothing) while hijacking arrow-key highlighting.
  const [search, setSearch] = useState("");
  const selectedSet = new Set(value);

  // Server-searching callers get cmdk's own filter turned OFF. `options` is then
  // the server's answer, and filtering it again here could only drop rows the
  // server chose to return — most visibly when the query matches a field the
  // option's `searchValue` does not carry.
  const serverSearch = onSearchChange !== undefined;

  const updateSearch = (next: string) => {
    setSearch(next);
    onSearchChange?.(next);
  };

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
      {/* Clearing on close is not cosmetic. `PopoverContent` is Portal-mounted
          with no `forceMount`, so cmdk's store dies with it and a reopened
          picker used to start empty for free. Now that the query lives up here
          it outlives the popover, and a controlled `CommandInput` re-injects it
          into the fresh store on reopen — a full list hidden behind a filter the
          user cannot see, under a search box that renders the stale text back.
          Clearing on the way out keeps our copy and the remounted store in
          agreement at every moment the popover is shut. */}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          // Through `updateSearch`, so a server-searching caller hears the reset
          // too. Leaving it on `setSearch` would clear the visible box while the
          // caller kept fetching the last query — and the reopened picker would
          // show those stale results under an empty search box.
          if (!next) updateSearch("");
        }}
      >
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
          <Command shouldFilter={!serverSearch}>
            <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={updateSearch} />
            <CommandList>
              {/* Two different facts, two different sentences. cmdk mounts this
                  node on `filtered.count === 0`, which means "the filter matched
                  nothing" — but `emptyText` is written by callers to mean "there
                  is nothing here", and at four call sites it carries the query's
                  whole three-way state (loading / failed / genuinely empty).

                  `options.length > 0` is what keeps those two apart, and it is
                  load-bearing rather than defensive: without it, typing during a
                  pending or failed load would replace "Couldn't load people…"
                  with "No matches for …" — asserting the roster loaded and
                  lacks that person, and disagreeing with the sr-only alert
                  above, which would still be announcing the failure. That is
                  the exact defect RUK-253/268/269 closed.

                  Note the precondition, because it is a convention rather than
                  a guarantee: this works because a caller reporting query state
                  through `emptyText` passes `[]` while that query is pending or
                  failed. A caller whose fallback is NON-empty — `placeholderData`,
                  or a `?? FALLBACK` constant — shows rows while still loading,
                  so this check does not fire and a search miss can render over
                  a pending load. All four query-state call sites use
                  `query.data ?? []` today. If one ever gains `placeholderData`,
                  it needs to stop routing query state through `emptyText`.

                  `.trim()` because cmdk does NOT trim the query (it trims item
                  values and the root `value`, not `search`). A lone space scores
                  0 against space-free labels — channel slugs, timezone ids — so
                  `filtered.count` really can hit 0 and render quote marks around
                  apparent nothing. */}
              {/* With `shouldFilter={false}` cmdk stops counting matches, so
                  `CommandEmpty` — which mounts on `filtered.count === 0` —
                  never fires. The server-search branch therefore decides for
                  itself, on the only fact that means anything there: the
                  server came back with no rows.

                  The two branches say different things on purpose. Client-side,
                  "no matches" is a claim about the LOADED page and needs
                  `options.length > 0` to avoid asserting it over a pending or
                  failed load. Server-side, an empty `options` under a non-empty
                  query IS the server's answer, and the caller still routes
                  loading/failure through `emptyText`. */}
              {serverSearch ? (
                options.length === 0 ? (
                  <div className="py-6 text-center text-sm" role="presentation">
                    {search.trim() ? `No matches for "${search}"` : emptyText}
                  </div>
                ) : null
              ) : (
                <CommandEmpty>
                  {search.trim() && options.length > 0 ? `No matches for "${search}"` : emptyText}
                </CommandEmpty>
              )}
              {/* Not memoized, unlike the twin list in `combobox.tsx`. That one
                  pays for the query living in React state because its
                  `description` accepts a THUNK, so a re-render re-evaluates it
                  per option — measured at 400 forced calls per keystroke on the
                  timezone picker. Here `description` is a plain node with
                  nothing to force, and the largest list is ~100 rows: measured
                  at ~21ms per keystroke, matching the memoized `Combobox`. A
                  `useMemo` here would buy nothing and would have to be kept in
                  sync with `selectedSet`. Revisit if a caller ever feeds this
                  component hundreds of options. */}
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
