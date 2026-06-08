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
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
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
  );
}
