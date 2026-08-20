"use client";

import { useMemo, useState } from "react";
import { Plug, Settings as SettingsIcon } from "lucide-react";

import { INTEGRATION_KINDS, type Integration, type IntegrationKind } from "@/domain/admin/integration";
import { Button } from "@/shared/ui/shadcn/button";
import { Switch } from "@/shared/ui/shadcn/switch";
import { Skeleton } from "@/shared/ui/domain/skeleton";
import { IntegrationBrandIcon } from "@/shared/ui/icons/brand-icons";
import { formatUtc } from "@/shared/ui/lib/format";
import { cn } from "@/shared/ui/lib/cn";

import { INTEGRATION_KIND_META } from "./integration-kinds";
import { IntegrationDialog } from "./integration-dialog";
import {
  useIntegrationsQuery,
  usePendingToggleKinds,
  useToggleIntegration,
} from "./queries/use-integrations-queries";

/**
 * Admin-only registry of notification transports at /admin/integrations
 * (screen 19, integrations-settings design snapshot). A closed list of
 * three kinds; a row is either configured (status + enabled switch +
 * Configure) or not (Set up → create sheet). No Delete — disable is the only
 * off-switch; no Test-connection (no backend endpoint).
 */
export function IntegrationsPage() {
  const integrationsQuery = useIntegrationsQuery();
  const toggleMutation = useToggleIntegration();
  const pendingToggles = usePendingToggleKinds();
  const [openKind, setOpenKind] = useState<IntegrationKind | null>(null);

  const byKind = useMemo(() => {
    const map = new Map<IntegrationKind, Integration>();
    for (const integration of integrationsQuery.data ?? []) {
      map.set(integration.kind, integration);
    }
    return map;
  }, [integrationsQuery.data]);

  return (
    <div className="mx-auto max-w-[720px] p-6 space-y-6">
      <header>
        <h1 className="h1">Integrations</h1>
        <p className="body-sm mt-1 text-fg-muted max-w-[560px]">
          Notification transports for maintenance events. Connected credentials are encrypted at rest and
          never shown back.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-wide font-semibold text-fg-muted">
          Notification transports
        </h2>

        {integrationsQuery.isPending ? (
          <Skeleton type="block" />
        ) : integrationsQuery.isError ? (
          <p className="body-sm text-[var(--destructive-fg)]">
            Couldn&apos;t load integrations.{" "}
            <button type="button" className="underline" onClick={() => integrationsQuery.refetch()}>
              Retry
            </button>
          </p>
        ) : (
          <div className="rounded-lg border border-border bg-bg-elev-1 p-3 space-y-2">
            {INTEGRATION_KINDS.map((kind) => (
              <IntegrationRow
                key={kind}
                kind={kind}
                integration={byKind.get(kind) ?? null}
                toggleBusy={pendingToggles.has(kind)}
                onToggle={(enabled) => toggleMutation.mutate({ kind, enabled })}
                onOpen={() => setOpenKind(kind)}
              />
            ))}
          </div>
        )}
      </section>

      <IntegrationDialog
        kind={openKind}
        integration={openKind ? (byKind.get(openKind) ?? null) : null}
        open={openKind !== null}
        onOpenChange={(open) => !open && setOpenKind(null)}
      />
    </div>
  );
}

function IntegrationRow({
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
  const meta = INTEGRATION_KIND_META[kind];
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
        <IntegrationBrandIcon name={kind} size={18} />
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
