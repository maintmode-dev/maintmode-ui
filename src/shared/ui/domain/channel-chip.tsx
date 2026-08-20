import { Bell, Send } from "lucide-react";
import { cn } from "@/shared/ui/lib/cn";
import { SlackGlyph } from "@/shared/ui/icons/slack-glyph";

export interface ChannelChipProps {
  name: string;
  /** Transport glyph driver: `slack | telegram | email | …` (open string). */
  transport?: string;
  className?: string;
}

/**
 * Read-only notify-channel chip — transport glyph + mono channel name. Mirrors
 * `ResourceChip` exactly (same border/bg/spacing) so a maintenance's Notify
 * channels read as the same family as its Resources.
 *
 * Source: the maintenance-quick-sheet design snapshot → NOTIFY
 * CHANNELS section (transport glyph + mono name, `.chip` primitive).
 */
export function ChannelChip({ name, transport, className }: ChannelChipProps) {
  const key = transport?.trim().toLowerCase();
  const Icon = key === "slack" ? SlackGlyph : key === "telegram" ? Send : Bell;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border border-border-subtle bg-bg-elev-3 text-fg text-xs leading-tight px-2 py-[3px]",
        className,
      )}
    >
      <span className="text-fg-muted [&_svg]:size-3 flex items-center">
        <Icon aria-hidden={true} />
      </span>
      <span className="font-mono">{name}</span>
    </span>
  );
}
