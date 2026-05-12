"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/primitives/alert-dialog";
import { Button } from "@/shared/ui/primitives/button";

type UnsavedChangesAlertProps = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function UnsavedChangesAlert({ open, onCancel, onConfirm }: UnsavedChangesAlertProps) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => (next ? null : onCancel())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription>
            Closing this form will lose the values you just entered.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Keep editing
          </Button>
          <Button type="button" variant="danger" size="sm" onClick={onConfirm}>
            Discard changes
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
