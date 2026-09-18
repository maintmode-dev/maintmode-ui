"use client";

import { useState } from "react";

import { BffError } from "@/features/_shared/api/bff-fetch";
import { Button } from "@/shared/ui/shadcn/button";
import { Skeleton } from "@/shared/ui/domain/skeleton";

import { AuthMethodRow } from "./auth-method-row";
import {
  useAuthMethodsQuery,
  usePendingAuthMethods,
  useSetAuthMethodEnabled,
} from "./queries/use-auth-methods-queries";

/**
 * There is no confirmation step before turning off the last enabled method.
 *
 * The backend had a guard that refused it with a 409, and this screen used to
 * warn ahead of the click and render the refusal. Both are gone: an instance
 * offering no built-in sign-in is a legitimate SSO-only configuration, and it is
 * not a lockout — disabling a method does not end sessions, so the admin keeps
 * the session they acted from, break-glass answers regardless, and the same
 * state is already reachable unguarded by disabling the last provider in the
 * integration registry.
 *
 * Said out loud because the ticket still describes the guard: its absence here
 * is a decision, not an omission.
 */

/**
 * What one row says when its toggle failed.
 *
 * A 404 has two causes and one status, and the screen cannot tell them apart:
 * the method really is gone, or the endpoint itself is missing because the
 * backend has not shipped this feature yet. Naming only the first sends an
 * operator hunting for a vanished row on a backend where no row ever existed —
 * the mistake the list route's own 404 copy avoids by knowing which request it
 * was. Observed in a browser against a backend without the endpoint.
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

export function AuthMethodsPage() {
  const query = useAuthMethodsQuery();
  const setEnabled = useSetAuthMethodEnabled();
  const pending = usePendingAuthMethods();
  const [refusals, setRefusals] = useState<Record<string, string>>({});

  const rows = query.data ?? [];

  function toggle(method: string, enabled: boolean) {
    setRefusals((current) => without(current, method));
    setEnabled.mutate(
      { method, enabled },
      {
        // Only this row's refusal is cleared, here and on success. Every message
        // `toRefusal` produces is a claim about ONE row — "the backend did not
        // recognise it", "you no longer have admin access" — and a different
        // method toggling successfully does not make any of them untrue.
        onSuccess: () => setRefusals((current) => without(current, method)),
        onError: (error) => setRefusals((current) => ({ ...current, [method]: toRefusal(error) })),
      },
    );
  }

  return (
    <div className="mx-auto max-w-[900px] px-6 py-8">
      <header className="mb-6">
        <h1 className="text-fg-strong text-xl font-semibold">Sign-in methods</h1>
        <p className="text-fg-muted mt-1 text-sm">
          Which built-in methods this instance offers. Turning one off closes it for new sign-ins; people
          already signed in stay signed in. Single sign-on providers are configured under Integrations.
        </p>
      </header>

      {query.isPending ? <Skeleton type="block" height={140} /> : null}

      {query.isError ? (
        <div className="border-border-strong rounded-lg border p-6">
          <p className="text-fg-strong font-medium">Sign-in method settings are unavailable</p>
          <p className="text-fg-muted mt-1 text-sm">
            The list came back empty or could not be read. Both built-in methods are created by a database
            migration, so an empty list means the backend is not in the state it should be — this is not a
            screen with nothing to show.
          </p>
          <Button className="mt-4" variant="outline" onClick={() => query.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}

      {query.isSuccess ? (
        <ul className="border-border-subtle bg-bg-elev-1 rounded-lg border">
          {rows.map((row) => (
            <AuthMethodRow
              key={row.method}
              method={row}
              busy={pending.has(row.method)}
              refusal={refusals[row.method]}
              onToggle={(enabled) => toggle(row.method, enabled)}
              onDismissRefusal={() => setRefusals((current) => without(current, row.method))}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
