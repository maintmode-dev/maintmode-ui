"use client";

import { Plug } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/shared/ui/shadcn/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/shadcn/tooltip";
import { SemanticPill } from "@/shared/ui/domain/semantic-pill";
import { Skeleton } from "@/shared/ui/domain/skeleton";
import { BrandIcon, IntegrationBrandIcon, type BrandProvider } from "@/shared/ui/icons/brand-icons";
import { BffError } from "@/features/_shared/api/bff-fetch";
import type { LinkFailure, LinkOutcome } from "@/domain/auth/link-outcome";

import {
  useConnectProvider,
  useDisconnectProvider,
  useSignInMethodsQuery,
} from "./queries/use-sign-in-methods";

const LINK_FAILURE_COPY: Record<LinkFailure, string> = {
  // The backend folds three cases into `link_conflict` on purpose — already
  // linked here, linked to someone else, or another account of this provider
  // already on this profile — so the copy names all three and picks none.
  // Saying "linked to another user" would reveal the one case it hides.
  link_conflict:
    "Couldn't link that account to your profile. It may already be linked — to this or another MaintMode account — or your profile may already have a different account from that provider. Check the list below: to replace an account, disconnect the current one first. If that doesn't help, contact your administrator.",
  denied: "Linking was cancelled, or the provider refused it. Nothing was changed.",
  failed: "Linking didn't complete. Nothing was changed — try again.",
};

const BRANDS: ReadonlySet<string> = new Set<BrandProvider>(["google", "github", "microsoft", "okta"]);

export interface SignInMethodsCardProps {
  /** `/me.connected_providers` — the providers this account can sign in with. */
  connectedProviders: string[];
  /** `/me.password_set`; `undefined` means the backend predates the field. */
  passwordSet?: boolean;
  /** The outcome of a link that just returned through the receiver, if any. */
  linkOutcome?: LinkOutcome;
}

/**
 * The profile's sign-in providers: which are linked, and linking or unlinking
 * one (GAP-2, v0.2.0-rc).
 *
 * It replaces a card whose Connect and Disconnect buttons had no handlers, over
 * a hardcoded Google/GitHub list, with a "Current session" pill that named the
 * first-linked provider rather than how the person actually signed in. The
 * backend reports no such thing, so the pill is gone rather than guessed.
 *
 * The rows are the providers this instance OFFERS (the public list `/login`
 * draws from), plus any the account is linked to that are no longer offered —
 * those can still be removed, and hiding them would hide a way into the
 * account.
 */
export function SignInMethodsCard({ connectedProviders, passwordSet, linkOutcome }: SignInMethodsCardProps) {
  const methodsQuery = useSignInMethodsQuery();
  const connect = useConnectProvider();
  const disconnect = useDisconnectProvider();
  const [returned] = useState(linkOutcome);
  const [actionError, setActionError] = useState<string>();
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!returned) return;
    // A fixed id, so the toast is shown once even when the effect runs twice
    // (React StrictMode in development mounts effects twice).
    if (returned === "linked") toast.success("Sign-in method connected.", { id: "link-outcome" });
    // The card sits below the fold, and the person arrives at the top of the
    // page straight from the provider — without this, a failure explained here
    // is a failure they never see. Optional-called: jsdom has no scrolling.
    cardRef.current?.scrollIntoView?.({ block: "center" });
    // Stripped from the address bar once read, so a reload does not announce
    // the same outcome again. Not a navigation: nothing re-renders for it.
    window.history.replaceState(null, "", window.location.pathname);
  }, [returned]);

  const connected = new Set(connectedProviders);
  const offered = (methodsQuery.data ?? []).filter((m) => m.type === "redirect");
  const offeredIds = new Set(offered.map((m) => m.id));
  const rows = [
    ...offered.map((m) => ({ id: m.id, label: m.display_name, offered: true })),
    ...connectedProviders
      .filter((id) => !offeredIds.has(id))
      .map((id) => ({ id, label: id, offered: false })),
  ];

  // The last way in cannot be removed — the same rule the backend applies
  // (BUG-10/BUG-11, v0.2.0-rc). A built-in method keeps an account reachable
  // when the INSTANCE offers it and the account can use it: email code needs
  // nothing but the mailbox, while a password needs both the method on and a
  // password set. The instance's offer is the public list the rows come from,
  // which carries only enabled methods.
  //
  // Until that list is known, only a set password counts, and `undefined`
  // (a backend that predates the field) counts as none: guessing wrong that
  // way offers a click the backend refuses, which is the worse of the two.
  const methods = methodsQuery.data;
  const codeOffered = methods?.some((m) => m.type === "code") ?? false;
  const passwordOffered = methods ? methods.some((m) => m.type === "password") : true;
  const passwordUsable = passwordOffered && passwordSet === true;
  const lastWayIn = connectedProviders.length <= 1 && !codeOffered && !passwordUsable;
  // What to suggest instead depends on what the instance offers: advising a
  // password on an instance with password sign-in off sends people in a circle.
  const lockoutAdvice = passwordOffered
    ? "Set a password or connect another provider first."
    : "Connect another provider first.";

  function onConnect(id: string) {
    setActionError(undefined);
    connect.mutate(id, {
      onError: (error) => {
        // Branch on the status only: the backend's 409 message tells "already
        // yours" from "someone else's", which is not ours to repeat.
        setActionError(
          error instanceof BffError && error.status === 409
            ? "Couldn't start linking — it may already be connected. Reload the page to check."
            : "Couldn't start linking. Try again.",
        );
      },
    });
  }

  function onDisconnect(id: string) {
    setActionError(undefined);
    disconnect.mutate(id, {
      onError: (error) => {
        // The 400 is the backend's last-way-in guard. Advice to set a password
        // is only honest when there is none: with one, the refusal is the
        // backend's to explain (its guard does not count passwords yet — BUG-10),
        // and telling someone who has a password to set one sends them in a
        // circle.
        setActionError(
          error instanceof BffError && error.status === 400
            ? passwordSet === true
              ? "The server refused to remove this sign-in method. Nothing was changed."
              : `This is your only way to sign in, so it can't be removed. ${lockoutAdvice}`
            : "Couldn't disconnect. Try again.",
        );
      },
    });
  }

  const busy = connect.isPending || disconnect.isPending;

  return (
    <div ref={cardRef} className="space-y-3">
      <p className="caption">Link another provider so you can sign in with whichever one is handy.</p>

      {returned && returned !== "linked" ? (
        <p role="alert" className="text-xs text-[var(--destructive-fg)]">
          {LINK_FAILURE_COPY[returned]}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="text-xs text-[var(--destructive-fg)]">
          {actionError}
        </p>
      ) : null}
      {methodsQuery.isError ? (
        <p role="alert" className="text-xs text-[var(--destructive-fg)]">
          Couldn&apos;t load this instance&apos;s sign-in providers. Linked ones are still listed below.
        </p>
      ) : null}

      <div className="space-y-2">
        {methodsQuery.isPending ? <Skeleton type="row" /> : null}
        {!methodsQuery.isPending && rows.length === 0 ? (
          <p className="caption">This instance offers no sign-in providers to link.</p>
        ) : null}
        {rows.map((row) => {
          const isConnected = connected.has(row.id);
          return (
            <div
              key={row.id}
              data-provider-id={row.id}
              className="flex items-center gap-3 px-3 py-2 rounded-sm bg-bg-elev-2 border border-border-subtle"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-white">
                {BRANDS.has(row.id) ? (
                  <BrandIcon name={row.id as BrandProvider} size={18} />
                ) : (
                  <IntegrationBrandIcon name="oidc" size={18} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={isConnected ? "block truncate text-sm" : "block truncate text-sm text-fg-muted"}
                >
                  {row.label}
                </span>
                {!row.offered ? (
                  <span className="caption block">No longer offered on this instance.</span>
                ) : null}
              </span>
              {isConnected ? (
                <SemanticPill tone="positive">Connected</SemanticPill>
              ) : (
                <span className="caption">Not connected</span>
              )}
              {isConnected ? (
                lastWayIn ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-block" tabIndex={0}>
                        <Button size="xs" variant="outline" disabled className="pointer-events-none">
                          Disconnect
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>It&apos;s your only way to sign in. {lockoutAdvice}</TooltipContent>
                  </Tooltip>
                ) : (
                  <Button size="xs" variant="outline" disabled={busy} onClick={() => onDisconnect(row.id)}>
                    Disconnect
                  </Button>
                )
              ) : row.offered ? (
                <Button size="xs" variant="default" disabled={busy} onClick={() => onConnect(row.id)}>
                  <Plug className="size-3.5" aria-hidden="true" /> Connect
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
