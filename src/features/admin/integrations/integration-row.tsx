"use client";

import { Plug, Settings as SettingsIcon, Trash2 } from "lucide-react";

import type { Integration } from "@/domain/admin/integration";
import { Button } from "@/shared/ui/shadcn/button";
import { Switch } from "@/shared/ui/shadcn/switch";

import { IntegrationHealthBadge } from "./integration-health";
import { IntegrationBrandIcon } from "@/shared/ui/icons/brand-icons";
import { formatUtc } from "@/shared/ui/lib/format";
import { cn } from "@/shared/ui/lib/cn";

import { kindMeta } from "./integration-kinds";

/**
 * One registry row, shared by both sections (transports and sign-in providers).
 * Everything system-specific comes from `kindMeta(name)` — the label, the
 * description and the brand mark — so the row itself stays system-blind. A
 * system with no descriptor renders nothing rather than throwing.
 *
 * Takes the SYSTEM name, not the category: the metadata registry is keyed by
 * system, and a category would resolve to null and render an empty row without
 * an error.
 */
export function IntegrationRow({
  name,
  integration,
  toggleBusy,
  onToggle,
  onOpen,
  onDelete,
}: {
  name: string;
  integration: Integration | null;
  toggleBusy: boolean;
  onToggle: (enabled: boolean) => void;
  onOpen: () => void;
  /** Absent where deletion is not offered. */
  onDelete?: () => void;
}) {
  const meta = kindMeta(name);
  if (!meta) return null;
  const configured = integration !== null;

  return (
    <div
      className={cn(
        "flex items-center gap-3.5 rounded-md border border-border-subtle px-3.5 py-3",
        configured ? "bg-bg-elev-2" : "bg-transparent",
      )}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-sm border border-border bg-white",
          !configured && "opacity-85",
        )}
      >
        <IntegrationBrandIcon name={meta.brand} size={18} />
      </span>

      <div className="flex-1 min-w-0">
        <div className={cn("text-sm font-semibold", configured ? "text-fg-strong" : "text-fg-muted")}>
          {meta.label}
        </div>
        {configured ? (
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-fg truncate">
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 rounded-full shrink-0",
                integration.enabled ? "bg-[var(--status-completed-fg)]" : "bg-fg-dim",
              )}
            />
            <span className="font-medium">{integration.enabled ? "Enabled" : "Disabled"}</span>
            {/* Login rows only. Keyed on the CATEGORY, not on `health` being
                truthy: the backend returns an empty value both for a transport
                (which has no such concept) and for a login row whose state it
                could not read, so a truthiness check would make "transports
                show nothing" an accident of the same empty string. */}
            {integration.kind === "login" ? (
              <>
                <span className="text-fg-dim">·</span>
                <IntegrationHealthBadge health={integration.health} />
              </>
            ) : null}
            <span className="text-fg-dim truncate">
              · updated {formatUtc(integration.updated_at)}
              {integration.updated_by ? ` by ${integration.updated_by}` : ""}
            </span>
          </div>
        ) : (
          <div className="mt-0.5 text-xs text-fg-muted truncate">Not configured · {meta.description}</div>
        )}
      </div>

      {configured ? (
        <Switch
          checked={integration.enabled}
          disabled={toggleBusy}
          onCheckedChange={onToggle}
          aria-label={`${meta.label} enabled`}
        />
      ) : null}

      {configured ? (
        <Button variant="ghost" size="sm" onClick={onOpen}>
          <SettingsIcon className="size-3.5" aria-hidden="true" /> Configure
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={onOpen}>
          <Plug className="size-3.5" aria-hidden="true" /> Set up
        </Button>
      )}

      {/* Only a configured row can be deleted — there is nothing to remove
          otherwise, and an always-present control would invite the question. */}
      {configured && onDelete ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          aria-label={`Delete ${meta.label}`}
          className="text-fg-muted hover:text-[var(--destructive-fg)]"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
