"use client";

import { useRef, useState } from "react";

import type { Integration } from "@/domain/admin/integration";
import { Input } from "@/shared/ui/shadcn/input";
import { Label } from "@/shared/ui/shadcn/label";
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

import { BffError } from "@/features/_shared/api/bff-fetch";

import { useDeleteIntegration } from "./queries/use-integrations-queries";

/**
 * Confirmation for removing an integration row.
 *
 * ## Why a login provider asks for the name to be typed
 *
 * Deleting one is irreversible and wider than the word "delete" suggests: the
 * backend unlinks every identity bound to that provider in the same
 * transaction and proceeds. Everyone who signs in through it loses their way
 * in, there is no undo short of restoring the database, and the API reports no
 * count — the number exists only in a server log line, and no endpoint offers
 * it beforehand.
 *
 * So the dialog cannot tell an operator how many people this affects. It says
 * so plainly instead of omitting it, and asks for the provider's name to be
 * typed: a single click is not proportionate consent for an action whose blast
 * radius the product itself cannot report.
 *
 * The name typed is the one the SCREEN shows ("Google", "Custom OIDC"), matched
 * without regard to case — not the registry key, which appears nowhere else in
 * the UI and read as a riddle (UX-7, v0.2.0-rc). It also points at the reversible
 * alternative, turning the provider off, since that is usually what was meant.
 *
 * A transport is a different matter — deleting one loses settings, not access —
 * so it keeps the plain confirmation every other destructive action here uses.
 * This is the only new interaction in this screen; everything else reuses the
 * existing AlertDialog primitives.
 */
export function DeleteIntegrationDialog({
  integration,
  label,
  open,
  onOpenChange,
}: {
  integration: Integration;
  /** The provider's display name, for the copy. */
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const deleteIntegration = useDeleteIntegration();
  const [typed, setTyped] = useState("");
  // Synchronous latch. `isPending` only lands on a re-render, so it cannot stop
  // a second click in the same tick — the same reason the probe button in
  // `integration-dialog` carries one. There a double fire is a duplicate email;
  // here it is a second irreversible cascade.
  const inFlightRef = useRef(false);

  const isLogin = integration.kind === "login";
  const confirmed = !isLogin || typed.trim().toLowerCase() === label.trim().toLowerCase();
  const busy = deleteIntegration.isPending;

  const close = (next: boolean) => {
    if (!next) {
      setTyped("");
      inFlightRef.current = false;
    }
    onOpenChange(next);
  };

  return (
    <AlertDialog open={open} onOpenChange={close}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isLogin ? `Delete ${label} sign-in?` : `Delete ${label}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {isLogin ? (
              <>
                Everyone who signs in through {label} loses access, and their accounts are unlinked. This
                cannot be undone, and the number of people affected is not available. To stop sign-ins without
                unlinking anyone, turn {label} off instead.
              </>
            ) : (
              <>Settings for {label} are removed. Notifications already sent are not affected.</>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {isLogin ? (
          <div className="space-y-1.5">
            <Label htmlFor="delete-integration-confirm" className="text-xs">
              Type <span className="font-medium">{label}</span> to confirm
            </Label>
            <Input
              id="delete-integration-confirm"
              value={typed}
              disabled={busy}
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          {/* The variant, not a className: `AlertDialogAction` renders `Button`
              through `asChild`, and Slot concatenates classes without merging
              them, so a background passed here lost to the default variant's
              and the irreversible action drew in the primary colour (UX-7). */}
          <AlertDialogAction
            variant="destructive"
            disabled={busy || !confirmed}
            onClick={(e) => {
              e.preventDefault();
              if (inFlightRef.current) return;
              inFlightRef.current = true;
              deleteIntegration.mutate(
                { kind: integration.kind, name: integration.name },
                {
                  onSuccess: () => close(false),
                  // Released on failure only: a success closes the dialog, and
                  // re-arming it there would let a late second click delete
                  // whatever row the operator opened next.
                  //
                  // A 409 closes it instead. The row cannot be deleted from here
                  // — typically the server's config file now declares it — and
                  // the refetch turns it read-only; a confirmation left open
                  // above it would keep an armed Delete for a row without one.
                  // The toast from the hook carries the backend's reason.
                  onError: (error) => {
                    if (error instanceof BffError && error.status === 409) {
                      close(false);
                      return;
                    }
                    inFlightRef.current = false;
                  },
                },
              );
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
