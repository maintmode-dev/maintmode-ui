"use client";

import { useState } from "react";

import { AUTH_INTEGRATION_KINDS, type IntegrationKind } from "@/domain/admin/integration";

// Importing this registers the auth kind metadata (see auth-kinds.ts).
import "./auth-kinds";
import { IntegrationDialog } from "./integration-dialog";
import { IntegrationRow } from "./integration-row";

/**
 * Sign-in providers on /admin/integrations — dev-only until the backend can
 * accept these kinds (RUK-294).
 *
 * Every row is unconfigured by design, which is why `integration` is a literal
 * `null` rather than a lookup: `mapIntegration` gates on `isIntegrationKind`,
 * which still rejects `oidc`/`github_oauth`, so no auth row can ever reach the
 * client. The section exists to review the forms, not to connect a provider —
 * the dialog says so and disables Save. When the backend learns these kinds,
 * the reconciliation pass restores the lookup along with the whitelist.
 *
 * No enable/disable toggle is wired for the same reason: there is nothing
 * configured to toggle.
 */
export function SignInProvidersSection() {
  const [openKind, setOpenKind] = useState<IntegrationKind | null>(null);

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
            integration={null}
            toggleBusy={false}
            onToggle={() => {}}
            onOpen={() => setOpenKind(kind)}
          />
        ))}
      </div>

      <IntegrationDialog
        kind={openKind}
        integration={null}
        open={openKind !== null}
        onOpenChange={(open) => !open && setOpenKind(null)}
      />
    </section>
  );
}
