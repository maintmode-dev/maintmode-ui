"use client";

import { useState } from "react";

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

  const isLogin = integration.kind === "login";
  const confirmed = !isLogin || typed.trim() === integration.name;
  const busy = deleteIntegration.isPending;

  const close = (next: boolean) => {
    if (!next) setTyped("");
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
                cannot be undone, and the number of people affected is not available.
              </>
            ) : (
              <>Settings for {label} are removed. Notifications already sent are not affected.</>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {isLogin ? (
          <div className="space-y-1.5">
            <Label htmlFor="delete-integration-confirm" className="text-xs">
              Type <span className="font-mono">{integration.name}</span> to confirm
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
          <AlertDialogAction
            disabled={busy || !confirmed}
            className="bg-[var(--destructive-solid)] text-white hover:bg-[var(--destructive-solid-hover)]"
            onClick={(e) => {
              e.preventDefault();
              deleteIntegration.mutate(
                { kind: integration.kind, name: integration.name },
                { onSuccess: () => close(false) },
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
