"use client";

import { useId } from "react";
import { Eye, Lock, Plug, Settings as SettingsIcon, Trash2 } from "lucide-react";

import type { Integration } from "@/domain/admin/integration";
import { Button } from "@/shared/ui/shadcn/button";
import { Switch } from "@/shared/ui/shadcn/switch";

import { IntegrationHealthBadge, healthAddsInformation } from "./integration-health";
import { IntegrationBrandIcon } from "@/shared/ui/icons/brand-icons";
import { formatUtc } from "@/shared/ui/lib/format";
import { cn } from "@/shared/ui/lib/cn";

import { PROVISIONED_NOTICE, integrationLabel, kindMeta } from "./integration-kinds";

/**
 * One registry row, shared by both sections (transports and sign-in providers).
 * Everything system-specific comes from `kindMeta(name)` — the label, the
 * description and the brand mark — so the row itself stays system-blind. A
 * system with no descriptor renders nothing rather than throwing.
 *
 * Takes the SYSTEM name, not the category: the metadata registry is keyed by
 * system, and a category would resolve to null and render an empty row without
 * an error.
 *
 * A row declared in the server's config file (`provisioned`) offers no write:
 * the backend refuses toggle, save and delete on it with 409, so the switch is
 * locked, delete is gone and Configure becomes View. Keyed on the flag, never
 * on the category — which kinds can be provisioned is the backend's call, and a
 * transport declared in config must render read-only without a change here.
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
  const lockedReasonId = useId();
  const meta = kindMeta(name);
  if (!meta) return null;
  const configured = integration !== null;
  const provisioned = integration?.provisioned === true;
  const label = integrationLabel(meta, integration);

  return (
    <div
      className={cn(
        // Wraps on a narrow screen (UX-5): the text keeps a minimum width and
        // the controls drop to their own line, where they used to squeeze the
        // name under the switch and cut the status to one letter.
        "flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-md border border-border-subtle px-3.5 py-3",
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

      <div className="flex-1 min-w-[12rem]">
        {/* items-baseline, not items-center: the badge sits on the name's text
            line, and the row itself is the only flex/items-center box here. */}
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className={cn("truncate text-sm font-semibold", configured ? "text-fg-strong" : "text-fg-muted")}
          >
            {label}
          </span>
          {provisioned ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-border px-1.5 text-2xs leading-4 text-fg-muted">
              <Lock className="size-3" aria-hidden="true" /> Managed by config
            </span>
          ) : null}
        </div>
        {/* `hidden`, not sr-only: read only as the switch's description, never a
            second time in the row's text. `aria-describedby` still resolves a
            hidden node. */}
        {provisioned ? (
          <span id={lockedReasonId} hidden>
            {PROVISIONED_NOTICE}
          </span>
        ) : null}
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
            {integration.kind === "login" && healthAddsInformation(integration) ? (
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

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {configured ? (
          <Switch
            checked={integration.enabled}
            disabled={toggleBusy || provisioned}
            onCheckedChange={onToggle}
            aria-label={`${label} enabled`}
            // A disabled button shows no title or tooltip, so the reason is
            // wired as a description rather than hung on hover.
            aria-describedby={provisioned ? lockedReasonId : undefined}
          />
        ) : null}

        {provisioned ? (
          <Button variant="ghost" size="sm" onClick={onOpen}>
            <Eye className="size-3.5" aria-hidden="true" /> View
          </Button>
        ) : configured ? (
          <Button variant="ghost" size="sm" onClick={onOpen}>
            <SettingsIcon className="size-3.5" aria-hidden="true" /> Configure
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={onOpen}>
            <Plug className="size-3.5" aria-hidden="true" /> Set up
          </Button>
        )}

        {/* Only a configured row can be deleted — there is nothing to remove
          otherwise, and an always-present control would invite the question.
          Nor a provisioned one: the backend refuses it, and a config-declared
          provider would come back on the next restart anyway. */}
        {configured && onDelete && !provisioned ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            aria-label={`Delete ${label}`}
            className="text-fg-muted hover:text-[var(--destructive-fg)]"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
