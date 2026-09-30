"use client";

import { useMemo, useState } from "react";

import {
  isLoginIntegrationName,
  type Integration,
  type IntegrationCategory,
} from "@/domain/admin/integration";

import { DeleteIntegrationDialog } from "./delete-integration-dialog";
import { IntegrationDialog } from "./integration-dialog";
import { integrationLabel, kindMeta } from "./integration-kinds";
import { IntegrationRow } from "./integration-row";
import {
  integrationRefKey as refKey,
  usePendingToggleRefs,
  useToggleIntegration,
} from "./queries/use-integrations-queries";

/**
 * One category of the integrations registry as a list of rows, with the
 * dialogs that open from them.
 *
 * Two screens render one category each: `/settings/workspace/integrations` the transports,
 * `/settings/workspace/authentication` the sign-in providers. Both read the SAME query and
 * hand its rows in, so a screen keeps one loading state and one way to fail;
 * this component only places rows and owns which one is open.
 *
 * Rows are looked up by the PAIR, never by name alone — the two categories are
 * separate namespaces (a login provider may be called `telegram`), and a lookup
 * by name would let a row from the other category answer for this one.
 *
 * A login row whose name this build does not know is dropped HERE, not by the
 * mapper: the mapper admits any known category on purpose, so a row it cannot
 * place still reaches someone who can count it (the Authentication page's
 * lockout check does). Dropping it in silence is what caused the incident the
 * pair-keying fixed, so the skip is announced.
 */
export function IntegrationList({
  kind,
  names,
  integrations,
}: {
  kind: IntegrationCategory;
  /** The systems to draw, in order — a name with no row renders as "Set up". */
  names: readonly string[];
  /** The whole registry, as the screen's one query returned it. */
  integrations: readonly Integration[];
}) {
  const toggleMutation = useToggleIntegration();
  const pendingToggles = usePendingToggleRefs();
  const [openName, setOpenName] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Integration | null>(null);

  const byName = useMemo(() => {
    const map = new Map<string, Integration>();
    for (const integration of integrations) {
      if (integration.kind !== kind) continue;
      if (integration.kind === "login" && !isLoginIntegrationName(integration.name)) {
        console.error("[integrations] no descriptor for login provider", { name: integration.name });
        continue;
      }
      map.set(integration.name, integration);
    }
    return map;
  }, [integrations, kind]);

  const openIntegration = openName ? (byName.get(openName) ?? null) : null;
  const deletingMeta = deleting ? kindMeta(deleting.name) : null;
  const deletingLabel = deletingMeta ? integrationLabel(deletingMeta, deleting) : (deleting?.name ?? "");

  return (
    <>
      <div className="space-y-2 rounded-lg border border-border bg-bg-elev-1 p-3">
        {names.map((name) => {
          const integration = byName.get(name) ?? null;
          const ref = { kind, name };
          return (
            <IntegrationRow
              key={refKey(ref)}
              name={name}
              integration={integration}
              toggleBusy={pendingToggles.has(refKey(ref))}
              onToggle={(enabled) => toggleMutation.mutate({ ref, enabled })}
              onOpen={() => setOpenName(name)}
              onDelete={integration ? () => setDeleting(integration) : undefined}
            />
          );
        })}
      </div>

      <IntegrationDialog
        kind={kind}
        name={openName}
        integration={openIntegration}
        open={openName !== null}
        onOpenChange={(open) => !open && setOpenName(null)}
      />

      {deleting ? (
        <DeleteIntegrationDialog
          integration={deleting}
          label={deletingLabel}
          open
          onOpenChange={(open) => !open && setDeleting(null)}
        />
      ) : null}
    </>
  );
}
