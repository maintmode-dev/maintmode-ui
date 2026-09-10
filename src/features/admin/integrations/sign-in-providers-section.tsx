"use client";

import { useMemo, useState } from "react";

import { AUTH_INTEGRATION_KINDS, type Integration, type IntegrationKind } from "@/domain/admin/integration";

// Importing this registers the auth kind metadata (see auth-kinds.ts).
import "./auth-kinds";
import { IntegrationDialog } from "./integration-dialog";
import { IntegrationRow } from "./integration-row";
import { useIntegrationsQuery } from "./queries/use-integrations-queries";

/**
 * Sign-in providers on /admin/integrations — dev-only until the backend can
 * accept these kinds (RUK-294).
 *
 * Every row is unconfigured by design: the BFF kind whitelist still rejects
 * `oidc`/`github_oauth`, so the mapper drops any such row and `byKind` can
 * never hold one. The section exists to review the forms, not to connect a
 * provider — the dialog says so and disables Save.
 *
 * No enable/disable toggle is wired for the same reason: there is nothing
 * configured to toggle.
 */
export function SignInProvidersSection() {
  const integrationsQuery = useIntegrationsQuery();
  const [openKind, setOpenKind] = useState<IntegrationKind | null>(null);

  const byKind = useMemo(() => {
    const map = new Map<IntegrationKind, Integration>();
    for (const integration of integrationsQuery.data ?? []) {
      map.set(integration.kind, integration);
    }
    return map;
  }, [integrationsQuery.data]);

  return (
    <section className="space-y-3">
      <h2 className="text-xs uppercase tracking-wide font-semibold text-fg-muted">Sign-in providers</h2>
      <p className="body-sm text-fg-muted max-w-[560px]">
        Identity providers people can sign in through. Changes apply immediately — no restart.
      </p>

      <div className="rounded-lg border border-border bg-bg-elev-1 p-3 space-y-2">
        {AUTH_INTEGRATION_KINDS.map((kind) => (
          <IntegrationRow
            key={kind}
            kind={kind}
            integration={byKind.get(kind) ?? null}
            toggleBusy={false}
            onToggle={() => {}}
            onOpen={() => setOpenKind(kind)}
          />
        ))}
      </div>

      <IntegrationDialog
        kind={openKind}
        integration={openKind ? (byKind.get(openKind) ?? null) : null}
        open={openKind !== null}
        onOpenChange={(open) => !open && setOpenKind(null)}
      />
    </section>
  );
}
