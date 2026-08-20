"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { cn } from "@/shared/ui/lib/cn";

export interface CopyFieldProps {
  /** The value shown (mono) and copied to the clipboard. */
  value: string;
  /** Accessible label for the copy button, e.g. "Copy id". */
  label: string;
  className?: string;
}

/**
 * Mono value + inline copy button, used in catalog detail meta rows for the
 * record id and the transport/external identifier. Source: the catalog
 * detail snapshots → meta row entries marked "(mono + copy)".
 */
export function CopyField({ value, label, className }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard may be unavailable (insecure context); fail silently — the
      // value is still visible to select manually.
    }
  };

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className="font-mono tabular-nums">{value}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={label}
        className="text-fg-dim hover:text-fg transition-colors"
      >
        {copied ? (
          <Check className="size-3" aria-hidden="true" />
        ) : (
          <Copy className="size-3" aria-hidden="true" />
        )}
      </button>
    </span>
  );
}
