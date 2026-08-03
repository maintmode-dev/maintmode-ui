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
  disabled?: boolean;
  className?: string;
  /** Aria-label for the trigger when no value is selected. */
  ariaLabel?: string;
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
  disabled,
  className,
  ariaLabel,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
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
  );
}
