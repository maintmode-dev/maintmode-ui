"use client";

import Link from "next/link";
import { useState } from "react";

import { LOGIN_INTEGRATION_NAMES } from "@/domain/admin/integration";
import { authMethodLabel } from "@/domain/auth/auth-method-settings";
import {
  emailTransportGap,
  signInReachability,
  wouldLockOutActor,
  type EmailTransportGap,
  type SignInReachability,
} from "@/domain/auth/sign-in-reachability";
import { BffError } from "@/features/_shared/api/bff-fetch";
import { useMeQuery } from "@/features/_shared/queries/use-me-query";
import { AuthMethodRow } from "@/features/admin/auth-methods/auth-method-row";
import {
  useAuthMethodsQuery,
  usePendingAuthMethods,
  useSetAuthMethodEnabled,
} from "@/features/admin/auth-methods/queries/use-auth-methods-queries";
import { IntegrationList } from "@/features/admin/integrations/integration-list";
import { useIntegrationsQuery } from "@/features/admin/integrations/queries/use-integrations-queries";
import { useSignInMethodsQuery } from "@/features/settings/queries/use-sign-in-methods";
import { Skeleton } from "@/shared/ui/domain/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/shadcn/alert-dialog";
import { Button } from "@/shared/ui/shadcn/button";

/**
 * Where break-glass signs in when `/login` offers nothing that works. Shown only
 * on this admin page; `/login` never links to it.
 */
const RECOVERY_PATH = "/login/recovery";

/**
 * Turning off the last way in is allowed, but not without asking.
 *
 * The backend had a guard that refused it with a 409; it is gone, and nothing
 * here blocks either: an instance offering no built-in sign-in is a legitimate
 * SSO-only configuration. This page used to only WARN, on the grounds that
 * switching a method off ends no sessions and break-glass answers regardless.
 * The second half did not hold in practice — `/login` stops drawing the
 * password form once password sign-in is off, so the break-glass account had
 * nowhere to type — and an admin with no linked provider locked themselves out.
 *
 * So switching off a built-in method asks first when it would leave THE ADMIN
 * DOING IT without a way in (`wouldLockOutActor`), and both that confirmation
 * and the lockout warning name `/login/recovery`, where break-glass still works.
 */

/**
 * What one method row says when its toggle failed.
 *
 * A 404 has two causes and one status, and the screen cannot tell them apart:
 * the method really is gone, or the endpoint itself is missing because the
 * backend has not shipped this feature yet. Naming only the first sends an
 * operator hunting for a vanished row on a backend where no row ever existed.
 */
function toRefusal(error: unknown): string {
  if (!(error instanceof BffError)) {
    return "Couldn't change this method. Try again.";
  }
  switch (error.status) {
    case 404:
      return "Couldn't change this method: the backend did not recognise it. It may have been removed, or this backend may not support sign-in method settings yet.";
    case 403:
      return "You no longer have admin access.";
    default:
      return "Couldn't change this method. Try again.";
  }
}

/** Drop one method's refusal, leaving the others standing. */
function without(refusals: Record<string, string>, method: string): Record<string, string> {
  return Object.fromEntries(Object.entries(refusals).filter(([key]) => key !== method));
}

const SECTION_HEADING = "text-xs font-semibold uppercase tracking-wide text-fg-muted";

/**
 * Admin-only `/admin/authentication`: every way into this instance on one page.
 *
 * Two parts: the built-in methods and the sign-in providers, with a warning
 * above them when neither leaves a way in. They used to be separate
 * tabs ("Sign-in methods" and a section of Integrations), which is why neither
 * could say whether anybody could still sign in (UX-4). Both lists are still
 * their own queries against their own endpoints — only the page is shared.
 *
 * Providers are rows of the integrations registry and are drawn by the same
 * `IntegrationList` the Integrations page uses, so everything a row knows —
 * health, read-only when declared in the server config — carries over as is.
 */
export function AuthenticationPage() {
  const methodsQuery = useAuthMethodsQuery();
  const integrationsQuery = useIntegrationsQuery();
  // What `/login` offers is the lockout check's source for the provider half.
  const signInQuery = useSignInMethodsQuery();
  const meQuery = useMeQuery();
  const setEnabled = useSetAuthMethodEnabled();
  const pending = usePendingAuthMethods();
  const [refusals, setRefusals] = useState<Record<string, string>>({});
  // The method whose switch-off is waiting on the self-lockout confirmation.
  const [confirming, setConfirming] = useState<string | null>(null);

  const methods = methodsQuery.data ?? [];
  const reachability = signInReachability(methodsQuery.data, {
    offered: signInQuery.data,
    integrations: integrationsQuery.data,
  });
  const emailGap = emailTransportGap(integrationsQuery.data);

  /**
   * The switch's own handler. Switching ON never locks anyone out; switching
   * OFF asks first when it would leave this admin without a way in.
   */
  function requestToggle(method: string, enabled: boolean) {
    if (
      !enabled &&
      wouldLockOutActor(methodsQuery.data, method, {
        offered: signInQuery.data,
        connected: meQuery.data?.connected_providers,
      })
    ) {
      setConfirming(method);
      return;
    }
    toggle(method, enabled);
  }

  function toggle(method: string, enabled: boolean) {
    setRefusals((current) => without(current, method));
    setEnabled.mutate(
      { method, enabled },
      {
        // Only this row's refusal is cleared, here and on success. Every message
        // `toRefusal` produces is a claim about ONE row, and a different method
        // toggling successfully does not make any of them untrue.
        onSuccess: () => setRefusals((current) => without(current, method)),
        onError: (error) => setRefusals((current) => ({ ...current, [method]: toRefusal(error) })),
      },
    );
  }

  return (
    <div className="mx-auto max-w-[720px] space-y-6 p-6">
      <header>
        <h1 className="h1">Authentication</h1>
        <p className="body-sm mt-1 max-w-[560px] text-fg-muted">
          How people sign in to this instance. Changes apply immediately; people already signed in stay signed
          in.
        </p>
      </header>

      <LockoutNotice reachability={reachability} />

      <section id="methods" className="scroll-mt-20 space-y-3" aria-labelledby="methods-heading">
        <h2 id="methods-heading" className={SECTION_HEADING}>
          Built-in methods
        </h2>

        {methodsQuery.isPending ? <Skeleton type="block" height={140} /> : null}

        {methodsQuery.isError ? (
          <div className="rounded-lg border border-border-strong p-6">
            <p className="font-medium text-fg-strong">Sign-in method settings are unavailable</p>
            <p className="mt-1 text-sm text-fg-muted">
              The list came back empty or could not be read. Both built-in methods are created by a database
              migration, so an empty list means the backend is not in the state it should be — this is not a
              screen with nothing to show.
            </p>
            <Button className="mt-4" variant="outline" onClick={() => methodsQuery.refetch()}>
              Try again
            </Button>
          </div>
        ) : null}

        {methodsQuery.isSuccess ? (
          <ul className="rounded-lg border border-border-subtle bg-bg-elev-1">
            {methods.map((row) => (
              <AuthMethodRow
                key={row.method}
                method={row}
                busy={pending.has(row.method)}
                refusal={refusals[row.method]}
                hint={
                  row.method === "email_otp" && row.enabled && emailGap ? (
                    <EmailTransportHint gap={emailGap} />
                  ) : undefined
                }
                onToggle={(enabled) => requestToggle(row.method, enabled)}
                onDismissRefusal={() => setRefusals((current) => without(current, row.method))}
              />
            ))}
          </ul>
        ) : null}

        <p className="text-xs text-fg-muted">
          If every way in is ever turned off, the server&apos;s break-glass administrator can still sign in at{" "}
          <Link href={RECOVERY_PATH} className="font-mono underline underline-offset-2">
            {RECOVERY_PATH}
          </Link>
          . The sign-in page does not link to it — keep the address somewhere safe.
        </p>
      </section>

      <section id="providers" className="scroll-mt-20 space-y-3" aria-labelledby="providers-heading">
        <h2 id="providers-heading" className={SECTION_HEADING}>
          Sign-in providers (SSO)
        </h2>
        <p className="body-sm max-w-[560px] text-fg-muted">
          Identity providers people can sign in through. Changes made here apply immediately — no restart.
          Providers declared in the server config file are changed there and applied on restart.
        </p>

        {integrationsQuery.isPending ? (
          <Skeleton type="block" />
        ) : integrationsQuery.isError ? (
          <p className="body-sm text-[var(--destructive-fg)]">
            Couldn&apos;t load sign-in providers.{" "}
            <button type="button" className="underline" onClick={() => integrationsQuery.refetch()}>
              Retry
            </button>
          </p>
        ) : (
          <IntegrationList
            kind="login"
            names={LOGIN_INTEGRATION_NAMES}
            integrations={integrationsQuery.data}
          />
        )}

        {/* Fixed copy: open sign-up is a server config flag no API reports. */}
        <p className="text-xs text-fg-muted">
          A provider does not let strangers in: someone with neither an account nor an invitation is refused,
          unless open sign-up is turned on in the server config.
        </p>
      </section>

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Turn off {confirming ? authMethodLabel(confirming) : ""} and lose your own sign-in?
            </AlertDialogTitle>
            <AlertDialogDescription>
              No built-in method would stay on, and your account is not linked to any provider the sign-in
              page offers. You stay signed in for now, but once you sign out you can get back only through
              break-glass, at <span className="font-mono">{RECOVERY_PATH}</span> — and only if the server has
              a break-glass administrator configured. Link a provider to your profile first to keep your own
              way in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it on</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (confirming) toggle(confirming, false);
                setConfirming(null);
              }}
            >
              Turn it off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * The lockout warning. Warns, never blocks.
 *
 * `lockout` is a statement, not a "may": the built-in flags were read and none
 * is on, and the sign-in page offers no provider button (judged from
 * `/login`'s own list, or from the registry when that list is unavailable —
 * see `signInReachability`).
 * `providers-unknown` says exactly what it cannot see. `unknown` — the built-in
 * list itself failed — renders nothing here; that section shows its own error.
 */
function LockoutNotice({ reachability }: { reachability: SignInReachability }) {
  if (reachability === "lockout") {
    return (
      <p
        role="status"
        className="rounded-md border border-[var(--destructive-fg)] px-3 py-2 text-sm text-[var(--destructive-fg)]"
      >
        Nobody can sign in except through break-glass: every built-in method is off and the sign-in page
        offers no provider. People already signed in stay signed in. Turn on a method or a provider below. The
        break-glass administrator can sign in at <span className="font-mono">{RECOVERY_PATH}</span>.
      </p>
    );
  }
  if (reachability === "providers-unknown") {
    return (
      <p
        role="status"
        className="rounded-md border border-[var(--status-in_progress-fg)] px-3 py-2 text-sm text-[var(--status-in_progress-fg)]"
      >
        Every built-in method is off, and neither the sign-in page&apos;s list nor the sign-in providers could
        be loaded — this page can&apos;t confirm that anyone can still sign in.
      </p>
    );
  }
  return null;
}

/**
 * Email code with nothing to send it through.
 *
 * Codes, invitations and reset codes all leave through the `notify/email`
 * transport. Enabling the method does not check it (the backend has no such
 * gate), so the row says so, with a way to the place it is fixed.
 */
function EmailTransportHint({ gap }: { gap: EmailTransportGap }) {
  return (
    <p className="text-sm text-[var(--status-in_progress-fg)]">
      {gap === "not_configured"
        ? "The Email transport is not set up, so no code can be sent."
        : "The Email transport is turned off, so no code can be sent."}{" "}
      <Link href="/admin/integrations#transports" className="underline underline-offset-2">
        {gap === "not_configured" ? "Set it up in Integrations →" : "Turn it on in Integrations →"}
      </Link>
    </p>
  );
}
