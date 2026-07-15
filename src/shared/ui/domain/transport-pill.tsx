import { Bell, Mail, Send } from "lucide-react";
import type { ComponentType } from "react";

import { SlackGlyph } from "@/shared/ui/icons/slack-glyph";
import { cn } from "@/shared/ui/lib/cn";

/**
 * Transport pill for notification channels. `transport` is an open
 * string from the backend catalog, so an unrecognised value still renders — it
 * just gets the neutral fallback styling and a generic bell icon.
 *
 * Colours come from the `--transport-*` tokens in globals.css. Archived rows
 * pass `archived` to desaturate the brand hue (an archived channel must not
 * read as live).
 *
 * Source intent: maintmode-docs/design-snapshots/channels-list (transport pill).
 */
type Glyph = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

interface TransportVisual {
  icon: Glyph;
  className: string;
}

const TRANSPORTS: Record<string, TransportVisual> = {
  slack: {
    icon: SlackGlyph,
    className:
      "text-[var(--transport-slack-fg)] bg-[var(--transport-slack-bg)] border-[var(--transport-slack-border)]",
  },
  telegram: {
    icon: Send,
    className:
      "text-[var(--transport-telegram-fg)] bg-[var(--transport-telegram-bg)] border-[var(--transport-telegram-border)]",
  },
  email: {
    icon: Mail,
    className:
      "text-[var(--transport-email-fg)] bg-[var(--transport-email-bg)] border-[var(--transport-email-border)]",
  },
};

const FALLBACK: TransportVisual = {
  icon: Bell,
  className: "text-fg-muted bg-bg-elev-3 border-border-subtle",
};

export interface TransportPillProps {
  transport: string;
  /** Desaturate to grayscale for archived channels. Default false. */
  archived?: boolean;
  className?: string;
}

export function TransportPill({ transport, archived = false, className }: TransportPillProps) {
  const key = transport.trim().toLowerCase();
  const visual = TRANSPORTS[key] ?? FALLBACK;
  const Icon = visual.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] rounded-full border font-mono text-[10px] font-semibold uppercase tracking-[0.05em] leading-[1.4] pl-[6px] pr-[8px] py-[3px]",
        visual.className,
        archived && "grayscale opacity-80",
        className,
      )}
    >
      <Icon className="size-[11px]" aria-hidden={true} />
      {transport || "—"}
    </span>
  );
}
