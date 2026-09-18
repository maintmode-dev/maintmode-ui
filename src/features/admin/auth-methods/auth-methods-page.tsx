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
  return rows.every((row) => (row.method === method ? true : !row.enabled));
}

/** Drop one method's refusal, leaving the others standing. */
function without(refusals: Record<string, string>, method: string): Record<string, string> {
  return Object.fromEntries(Object.entries(refusals).filter(([key]) => key !== method));
}

export function AuthMethodsPage() {
  const query = useAuthMethodsQuery();
  const setEnabled = useSetAuthMethodEnabled();
  const pending = usePendingAuthMethods();
  const [confirming, setConfirming] = useState<AuthMethod | null>(null);
  const [refusals, setRefusals] = useState<Record<string, string>>({});

  const rows = query.data ?? [];

  function submit(method: string, enabled: boolean) {
    setRefusals((current) => without(current, method));
    setEnabled.mutate(
      { method, enabled },
      {
        onError: (error) => {
          if (error instanceof BffError && error.status === 409) {
            // 409 on this endpoint means one thing: the guard fired. The
            // backend's sentence is shown as-is when it says something.
            setRefusals((current) => ({ ...current, [method]: refusalMessage(error.message, 409) }));
            return;
          }
          const message =
            error instanceof BffError && error.status === 404
              ? "This method no longer exists."
              : error instanceof BffError && error.status === 403
                ? "You no longer have admin access."
                : "Couldn't change this method. Try again.";
          setRefusals((current) => ({ ...current, [method]: message }));
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
          Which built-in methods this instance offers. Turning one off closes it for new sign-ins;
          people already signed in stay signed in. Single sign-on providers are configured under
          Integrations.
        </p>
      </header>

      {query.isPending ? <Skeleton type="block" height={140} /> : null}

      {query.isError ? (
        <div className="border-border-strong rounded-lg border p-6">
          <p className="text-fg-strong font-medium">Sign-in method settings are unavailable</p>
          <p className="text-fg-muted mt-1 text-sm">
            The list came back empty or could not be read. Both built-in methods are created by a
            database migration, so an empty list means the backend is not in the state it should be
            — this is not a screen with nothing to show.
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
              This is the last method switched on here, so it may leave no way to sign in. Any
              single sign-on provider that is configured and working also counts, and this screen
              cannot see those — so the change may well succeed. If the backend refuses it, it is
              protecting the instance from locking everyone out.
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
