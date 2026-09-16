"use client";

import { useMemo, useState, type ReactNode } from "react";

import { NOTIFICATION_INTEGRATION_NAMES, type Integration } from "@/domain/admin/integration";
import { Switch } from "@/shared/ui/shadcn/switch";
import { Skeleton } from "@/shared/ui/domain/skeleton";

import { IntegrationDialog } from "./integration-dialog";
import { IntegrationRow } from "./integration-row";
import {
  useIntegrationsQuery,
  usePendingToggleNames,
  useToggleIntegration,
} from "./queries/use-integrations-queries";

/**
 * Admin-only integrations registry at /admin/integrations (screen 19,
 * integrations-settings design snapshot). A row is either configured (status +
 * enabled switch + Configure) or not (Set up → create sheet). No Delete —
 * disable is the only off-switch; no Test-connection (no backend endpoint).
 *
 * The sign-in providers section is passed in rather than rendered here: it is
 * dev-only, and the server page gates it behind an inlined NODE_ENV check so
 * the whole branch drops out of a production build (RUK-294).
 */
export function IntegrationsPage({ signInProviders }: { signInProviders?: ReactNode }) {
  const integrationsQuery = useIntegrationsQuery();
  const toggleMutation = useToggleIntegration();
  const pendingToggles = usePendingToggleNames();
  const [openName, setOpenName] = useState<string | null>(null);

  /**
   * Keyed by SYSTEM, and filtered to this section's category first. `kind` now
   * holds the category, so keying by it would collapse all three transports
   * onto one entry — the last row in the response would win and the other two
   * would render as unconfigured.
   */
  const byName = useMemo(() => {
    const map = new Map<string, Integration>();
    for (const integration of integrationsQuery.data ?? []) {
      if (integration.kind === "notify") map.set(integration.name, integration);
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
            {NOTIFICATION_INTEGRATION_NAMES.map((name) => (
              <IntegrationRow
                key={name}
                name={name}
                integration={byName.get(name) ?? null}
                toggleBusy={pendingToggles.has(name)}
                onToggle={(enabled) => toggleMutation.mutate({ ref: { kind: "notify", name }, enabled })}
                onOpen={() => setOpenName(name)}
              />
            ))}
          </div>
        )}
      </section>

      {signInProviders}

      <IntegrationDialog
        name={openName}
        integration={openName ? (byName.get(openName) ?? null) : null}
        open={openName !== null}
        onOpenChange={(open) => !open && setOpenName(null)}
      />
    </div>
  );
}
