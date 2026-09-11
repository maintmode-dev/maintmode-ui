"use client";

import { Plug, Settings as SettingsIcon } from "lucide-react";

import type { Integration, IntegrationKind } from "@/domain/admin/integration";
import { Button } from "@/shared/ui/shadcn/button";
import { Switch } from "@/shared/ui/shadcn/switch";
import { IntegrationBrandIcon } from "@/shared/ui/icons/brand-icons";
import { formatUtc } from "@/shared/ui/lib/format";
import { cn } from "@/shared/ui/lib/cn";

import { kindMeta } from "./integration-kinds";

/**
 * One registry row, shared by both sections (transports and sign-in providers).
 * Everything category-specific comes from `kindMeta(kind)` — the label, the
 * description and the brand mark — so the row itself stays category-blind. A
 * kind whose metadata is not registered renders nothing rather than throwing;
 * that is the production state for the auth kinds, whose metadata ships only
 * with the dev-only section.
 */
export function IntegrationRow({
  kind,
  integration,
  toggleBusy,
  onToggle,
  onOpen,
}: {
  kind: IntegrationKind;
  integration: Integration | null;
  toggleBusy: boolean;
  onToggle: (enabled: boolean) => void;
  onOpen: () => void;
}) {
  const meta = kindMeta(kind);
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
    </div>
  );
}
