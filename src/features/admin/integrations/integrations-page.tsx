"use client";

import { useMemo, useState } from "react";

import {
  LOGIN_INTEGRATION_NAMES,
  NOTIFICATION_INTEGRATION_NAMES,
  isLoginIntegrationName,
  type Integration,
  type IntegrationCategory,
} from "@/domain/admin/integration";
import { Skeleton } from "@/shared/ui/domain/skeleton";

import { DeleteIntegrationDialog } from "./delete-integration-dialog";
import { IntegrationDialog } from "./integration-dialog";
import { kindMeta } from "./integration-kinds";
import { IntegrationRow } from "./integration-row";
import {
  useIntegrationsQuery,
  usePendingToggleNames,
  useToggleIntegration,
} from "./queries/use-integrations-queries";

/** A row's identity, and the only safe key now that one screen holds both halves. */
type Ref = { kind: IntegrationCategory; name: string };

const refKey = ({ kind, name }: Ref) => `${kind}/${name}`;

/**
 * Admin-only integrations registry at /admin/integrations (screen 19,
 * integrations-settings design snapshot).
 *
 * Two sections, one query. The sign-in half used to be passed in as a prop and
 * rendered by the server page behind a NODE_ENV gate; it is rendered here now
 * that the gate is gone, because a section handed in as a node cannot read this
 * query — and giving it its own would leave the screen with two loading states
 * and two ways to fail independently.
 */
export function IntegrationsPage() {
  const integrationsQuery = useIntegrationsQuery();
  const toggleMutation = useToggleIntegration();
  const pendingToggles = usePendingToggleNames();
  const [openRef, setOpenRef] = useState<Ref | null>(null);
  const [deleting, setDeleting] = useState<Integration | null>(null);

  /**
   * Keyed by the PAIR. Keying by name alone held while this screen rendered one
   * category; with both on screen it is one backend addition away from two rows
   * answering to the same key, and the loser would render as unconfigured —
   * the failure this feature has already shipped once.
   *
   * A login row whose name this build does not know is dropped HERE, not by the
   * mapper: the mapper admits any known category on purpose, so a row it cannot
   * place still reaches someone who can count it. Dropping it in silence is
   * what caused that incident, so the skip is announced.
   */
  const byRef = useMemo(() => {
    const map = new Map<string, Integration>();
    for (const integration of integrationsQuery.data ?? []) {
      if (integration.kind === "login" && !isLoginIntegrationName(integration.name)) {
        console.error("[integrations-page] no descriptor for login provider", {
          name: integration.name,
        });
        continue;
      }
      map.set(refKey(integration), integration);
    }
    return map;
  }, [integrationsQuery.data]);

  const rowsFor = (kind: IntegrationCategory, names: readonly string[]) => (
    <div className="rounded-lg border border-border bg-bg-elev-1 p-3 space-y-2">
      {names.map((name) => {
        const integration = byRef.get(refKey({ kind, name })) ?? null;
        return (
          <IntegrationRow
            key={name}
            name={name}
            integration={integration}
            toggleBusy={pendingToggles.has(name)}
            onToggle={(enabled) => toggleMutation.mutate({ ref: { kind, name }, enabled })}
            onOpen={() => setOpenRef({ kind, name })}
            onDelete={integration ? () => setDeleting(integration) : undefined}
          />
        );
      })}
    </div>
  );

  const openIntegration = openRef ? (byRef.get(refKey(openRef)) ?? null) : null;

  return (
    <div className="mx-auto max-w-[720px] p-6 space-y-6">
      <header>
        <h1 className="h1">Integrations</h1>
        <p className="body-sm mt-1 text-fg-muted max-w-[560px]">
          Notification transports and sign-in providers. Connected credentials are encrypted at rest and never
          shown back.
        </p>
      </header>

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
        <>
          <section className="space-y-3">
            <h2 className="text-xs uppercase tracking-wide font-semibold text-fg-muted">
              Notification transports
            </h2>
            {rowsFor("notify", NOTIFICATION_INTEGRATION_NAMES)}
          </section>

          <section className="space-y-3">
            <h2 className="text-xs uppercase tracking-wide font-semibold text-fg-muted">Sign-in providers</h2>
            <p className="body-sm text-fg-muted max-w-[560px]">
              Identity providers people can sign in through. Changes apply immediately — no restart.
            </p>
            {rowsFor("login", LOGIN_INTEGRATION_NAMES)}
          </section>
        </>
      )}

      <IntegrationDialog
        kind={openRef?.kind ?? "notify"}
        name={openRef?.name ?? null}
        integration={openIntegration}
        open={openRef !== null}
        onOpenChange={(open) => !open && setOpenRef(null)}
      />

      {deleting ? (
        <DeleteIntegrationDialog
          integration={deleting}
          label={kindMeta(deleting.name)?.label ?? deleting.name}
          open
          onOpenChange={(open) => !open && setDeleting(null)}
        />
      ) : null}
    </div>
  );
}
