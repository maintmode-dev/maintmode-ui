"use client";

import { useState } from "react";

import { LOGIN_INTEGRATION_NAMES, type LoginIntegrationName } from "@/domain/admin/integration";

import { IntegrationDialog } from "./integration-dialog";
import { IntegrationRow } from "./integration-row";

/**
 * Sign-in providers on /admin/integrations.
 *
 * The names are the backend registry's own — `(login, google)` and
 * `(login, custom)`. They replace `oidc`/`github_oauth`, which named nothing
 * and were placeholders for exactly this change.
 *
 * Rows are still `integration={null}` and the toggle is still inert: this
 * commit corrects the vocabulary and the descriptors, and the section is still
 * dev-gated by the page above it. Wiring the query, the toggle and the health
 * indicator is the task that removes that gate — doing both at once would put a
 * live credentials form behind a whitelist that has not widened yet.
 */
export function SignInProvidersSection() {
  const [openName, setOpenName] = useState<LoginIntegrationName | null>(null);

  return (
    <section className="space-y-3">
      <h2 className="text-xs uppercase tracking-wide font-semibold text-fg-muted">Sign-in providers</h2>
      <p className="body-sm text-fg-muted max-w-[560px]">
        Identity providers people can sign in through. Changes apply immediately — no restart.
      </p>

      <div className="rounded-lg border border-border bg-bg-elev-1 p-3 space-y-2">
        {LOGIN_INTEGRATION_NAMES.map((name) => (
          <IntegrationRow
            key={name}
            name={name}
            integration={null}
            toggleBusy={false}
            onToggle={() => {}}
            onOpen={() => setOpenName(name)}
          />
        ))}
      </div>

      <IntegrationDialog
        name={openName}
        integration={null}
        open={openName !== null}
        onOpenChange={(open) => !open && setOpenName(null)}
      />
    </section>
  );
}
