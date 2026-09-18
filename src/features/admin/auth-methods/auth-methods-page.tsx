"use client";

import { useState } from "react";

import { BffError } from "@/features/_shared/api/bff-fetch";
import type { AuthMethod } from "@/domain/auth/auth-method-settings";
import { authMethodLabel } from "@/domain/auth/auth-method-settings";
import { Button } from "@/shared/ui/shadcn/button";
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

import { AuthMethodRow } from "./auth-method-row";
import { refusalMessage } from "./refusal-message";
import {
  useAuthMethodsQuery,
  usePendingAuthMethods,
  useSetAuthMethodEnabled,
} from "./queries/use-auth-methods-queries";

/**
 * Would this change leave nothing on screen switched on?
 *
 * The single normative rule for the confirmation dialog: count every row
 * currently rendered as enabled, treat the row being changed as already off,
 * and ask whether the total is zero.
 *
 * Three consequences, each deliberate. It reads the OPTIMISTIC rows, so a
 * disable already in flight elsewhere counts as done — which is what the admin
 * sees. An unknown method COUNTS, because it is a live sign-in path; a count
 * written over the closed set would omit it, which is the natural
 * implementation and the wrong one. And it sees only this screen: SSO providers
 * also satisfy the backend's guard but are invisible here, which is why the
 * dialog says "may", never "will".
 */
export function wouldLeaveNoneEnabled(rows: AuthMethod[], method: string): boolean {
  // `rows.length > 0` because `[].every()` is vacuously true, which would ask
  // an admin to confirm turning off a method on a screen showing none. Not
  // reachable today — the query throws before an empty list renders — but this
  // is exported and unit-tested apart from that guarantee.
  return rows.length > 0 && rows.every((row) => (row.method === method ? true : !row.enabled));
}

/**
 * What one row says when its toggle was refused.
 *
 * 409 on this endpoint means one thing: the guard fired. The backend's sentence
 * is shown as-is when it says something.
 *
 * 404 has two causes, one status, and the screen cannot tell them apart: the
 * method really is gone, or the endpoint itself is missing because the backend
 * has not shipped this feature yet. Naming only the first sends an operator
 * hunting for a vanished row on a backend where no row ever existed — the
 * mistake the list route's own 404 copy avoids by knowing which request it was.
 * Observed in a browser against a backend without the endpoint.
 */
type Refusal = { text: string; status?: number };

function toRefusal(error: unknown): Refusal {
  if (!(error instanceof BffError)) {
    return { text: "Couldn't change this method. Try again." };
  }
  switch (error.status) {
    case 409:
      return { text: refusalMessage(error.message, 409), status: 409 };
    case 404:
      return {
        text: "Couldn't change this method: the backend did not recognise it. It may have been removed, or this backend may not support sign-in method settings yet.",
        status: 404,
      };
    case 403:
      return { text: "You no longer have admin access.", status: 403 };
    default:
      return { text: "Couldn't change this method. Try again.", status: error.status };
  }
}

/**
 * Which refusals a successful toggle has actually disproved.
 *
 * Only the 409 is a claim about the SCREEN — "at least one sign-in method must
 * remain enabled" describes the instance, so any successful change makes it
 * stale. Everything else is a claim about ONE row: "the backend did not
 * recognise it", "you no longer have admin access". Toggling an unrelated
 * method does not make those untrue, and clearing them would leave the admin
 * with a switch that snapped back and no statement of why — losing, in the 409
 * case that motivated the clearing, the one sentence that says whether the
 * change is recoverable.
 */
function afterSuccess(refusals: Record<string, Refusal>, method: string): Record<string, Refusal> {
  return Object.fromEntries(
    Object.entries(refusals).filter(([key, refusal]) => key !== method && refusal.status !== 409),
  );
}

/** Drop one method's refusal, leaving the others standing. */
function without(refusals: Record<string, Refusal>, method: string): Record<string, Refusal> {
  return Object.fromEntries(Object.entries(refusals).filter(([key]) => key !== method));
}

export function AuthMethodsPage() {
  const query = useAuthMethodsQuery();
  const setEnabled = useSetAuthMethodEnabled();
  const pending = usePendingAuthMethods();
  const [confirming, setConfirming] = useState<AuthMethod | null>(null);
  const [refusals, setRefusals] = useState<Record<string, Refusal>>({});

  const rows = query.data ?? [];

  function submit(method: string, enabled: boolean) {
    setRefusals((current) => without(current, method));
    setEnabled.mutate(
      { method, enabled },
      {
        onSuccess: () => {
          setRefusals((current) => afterSuccess(current, method));
        },
        onError: (error) => {
          setRefusals((current) => ({ ...current, [method]: toRefusal(error) }));
        },
      },
    );
  }

  function requestToggle(row: AuthMethod, enabled: boolean) {
    if (!enabled && wouldLeaveNoneEnabled(rows, row.method)) {
      setConfirming(row);
      return;
    }
    submit(row.method, enabled);
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
              refusal={refusals[row.method]?.text}
              onToggle={(enabled) => requestToggle(row, enabled)}
              onDismissRefusal={() => setRefusals((current) => without(current, row.method))}
            />
          ))}
        </ul>
      ) : null}

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Turn off {confirming ? authMethodLabel(confirming.method) : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This is the last method switched on here, so it may leave no way to sign in. Any single sign-on
              provider that is configured and working also counts, and this screen cannot see those — so the
              change may well succeed. If the backend refuses it, it is protecting the instance from locking
              everyone out.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirming) submit(confirming.method, false);
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
