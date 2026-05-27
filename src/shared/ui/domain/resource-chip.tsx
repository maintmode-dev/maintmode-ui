import { Box, Boxes, Database, X } from "lucide-react";
import type { MouseEventHandler } from "react";
import { cn } from "@/shared/ui/lib/cn";

export type ResourceType = "database" | "cluster" | "service" | string;

export interface ResourceChipProps {
  name: string;
  type?: ResourceType;
  /** Render an inline remove (X) button. */
  onRemove?: MouseEventHandler<HTMLButtonElement>;
  className?: string;
}

function ResourceIcon({ type }: { type?: ResourceType }) {
  if (type === "database") return <Database aria-hidden="true" />;
  if (type === "cluster") return <Boxes aria-hidden="true" />;
  return <Box aria-hidden="true" />;
}

/**
 * Source: maintmode-docs/design-snapshots/maintenance-details-page/project/components.jsx → `ResourceChip`.
 * The X-button variant is the edit-mode chip.
 */
export function ResourceChip({ name, type, onRemove, className }: ResourceChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border border-border-subtle bg-bg-elev-3 text-fg text-xs leading-tight",
        onRemove ? "pl-2 pr-1 py-[3px]" : "px-2 py-[3px]",
        className,
      )}
    >
      <span className="text-fg-muted [&_svg]:size-3 flex items-center">
        <ResourceIcon type={type} />
      </span>
      <span className="font-mono">{name}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="ml-0.5 inline-grid place-items-center size-4 rounded-xs text-fg-muted hover:bg-bg-elev-4 hover:text-fg"
        >
          <X className="size-3" aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}
