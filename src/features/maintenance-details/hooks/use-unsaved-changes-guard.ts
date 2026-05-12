"use client";

import { useCallback, useState } from "react";

export type UseUnsavedChangesGuardOptions = {
  isDirty: boolean;
  onDiscard: () => void;
};

export type UseUnsavedChangesGuardResult = {
  guardOpen: boolean;
  requestClose: () => void;
  confirmDiscard: () => void;
  cancelDiscard: () => void;
};

/**
 * Intercepts close intents on a form-bearing surface. When the form is dirty,
 * surfaces a guard the caller renders (e.g. AlertDialog). When clean, closes
 * immediately.
 */
export function useUnsavedChangesGuard({
  isDirty,
  onDiscard,
}: UseUnsavedChangesGuardOptions): UseUnsavedChangesGuardResult {
  const [guardOpen, setGuardOpen] = useState(false);

  const requestClose = useCallback(() => {
    if (isDirty) {
      setGuardOpen(true);
      return;
    }
    onDiscard();
  }, [isDirty, onDiscard]);

  const confirmDiscard = useCallback(() => {
    setGuardOpen(false);
    onDiscard();
  }, [onDiscard]);

  const cancelDiscard = useCallback(() => {
    setGuardOpen(false);
  }, []);

  return { guardOpen, requestClose, confirmDiscard, cancelDiscard };
}
