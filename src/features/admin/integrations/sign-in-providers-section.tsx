"use client";

import { useState } from "react";

import { AUTH_INTEGRATION_KINDS, type AuthIntegrationKind } from "@/domain/admin/integration";

// Importing this registers the auth kind metadata (see auth-kinds.ts).
import "./auth-kinds";
import { IntegrationDialog } from "./integration-dialog";
import { IntegrationRow } from "./integration-row";

/**
 * Sign-in providers on /admin/integrations — dev-only, pending RUK-302.
 *
 * Every row is unconfigured by design, which is why `integration` is a literal
 * `null` rather than a lookup. What keeps it that way is the BFF whitelist:
 * `resolveIntegrationParams` admits the `notify` category only, so no login row
 * is reachable through these routes and nothing typed into a form here can
 * leave the browser. The section exists to review the forms, not to connect a
 * provider — the dialog says so and disables Save.
 *
 * The identifiers below (`oidc`, `github_oauth`) name nothing in the backend's
 * vocabulary. Since `b74a4536` a login provider is `(login, google)`,
 * `(login, custom)` or `(login, github)`; these two are left exactly as they
 * are because RUK-302 rewrites this section's descriptors wholesale, and
 * correcting them here would collide with that for no gain (SPEC §1.1).
 *
 * The previous version of this paragraph credited `isIntegrationKind`, which no
 * longer exists — the stale-comment failure the mapper's own docblock warns
 * about, found in review.
 *
 * No enable/disable toggle is wired for the same reason: there is nothing
 * configured to toggle.
 */
export function SignInProvidersSection() {
  const [openKind, setOpenKind] = useState<AuthIntegrationKind | null>(null);

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
            name={kind}
            integration={null}
            toggleBusy={false}
            onToggle={() => {}}
            onOpen={() => setOpenKind(kind)}
          />
        ))}
      </div>

      <IntegrationDialog
        name={openKind}
        integration={null}
        open={openKind !== null}
        onOpenChange={(open) => !open && setOpenKind(null)}
      />
    </section>
  );
}
