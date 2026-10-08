"use client";

import Link from "next/link";

import { NOTIFICATION_INTEGRATION_NAMES } from "@/domain/admin/integration";
import { Skeleton } from "@/shared/ui/domain/skeleton";

import { IntegrationList } from "./integration-list";
import { useIntegrationsQuery } from "./queries/use-integrations-queries";

/**
 * Admin-only integrations registry at /admin/integrations (screen 19,
 * integrations-settings design snapshot): the notification transports.
 *
 * The sign-in providers used to be a second section here. They live on
 * `/admin/authentication` now, beside the built-in methods, because what
 * `/login` offers is decided by both halves together and only a page that sees
 * both can say so. They are still rows of the same registry — this page simply
 * no longer draws that category. A one-line pointer stays for a release, for
 * admins who look for them here out of habit.
 */
export function IntegrationsPage() {
  const integrationsQuery = useIntegrationsQuery();

  return (
    <div className="mx-auto max-w-[720px] p-6 space-y-6">
      <header>
        <h1 className="h1">Integrations</h1>
        <p className="body-sm mt-1 text-fg-muted max-w-[560px]">
          How MaintMode reaches people. Slack and Telegram deliver maintenance notifications to channels;
          email carries invitations, sign-in codes and password resets. Credentials are encrypted at rest and
          never shown back. Transports declared in the server config file are changed there and applied on
          restart.
        </p>
        <p className="body-sm mt-2 text-fg-muted">
          <Link href="/admin/authentication#providers" className="underline underline-offset-2">
            Sign-in providers moved to Authentication →
          </Link>
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
        <section id="transports" className="space-y-3">
          <h2 className="text-xs uppercase tracking-wide font-semibold text-fg-muted">
            Notification transports
          </h2>
          <IntegrationList
            kind="notify"
            names={NOTIFICATION_INTEGRATION_NAMES}
            integrations={integrationsQuery.data}
          />
        </section>
      )}
    </div>
  );
}
