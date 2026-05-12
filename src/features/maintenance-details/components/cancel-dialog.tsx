"use client";

import { useState } from "react";

import { Button } from "@/shared/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/primitives/dialog";

export type CancelReason =
  | "conflict"
  | "incident"
  | "business_decision"
  | "rescheduled"
  | "mistake";

export type CancelDialogResult = {
  reason: CancelReason;
  comment: string;
};

type CancelDialogProps = {
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (result: CancelDialogResult) => void;
};

const REASONS: ReadonlyArray<{ value: CancelReason; label: string }> = [
  { value: "conflict", label: "Conflict" },
  { value: "incident", label: "Incident" },
  { value: "business_decision", label: "Business decision" },
  { value: "rescheduled", label: "Rescheduled" },
  { value: "mistake", label: "Mistake" },
];

export function CancelDialog({ open, pending, onOpenChange, onConfirm }: CancelDialogProps) {
  const [reason, setReason] = useState<CancelReason>("business_decision");
  const [comment, setComment] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="cancel-dialog-description">
        <DialogHeader>
          <DialogTitle>Cancel maintenance</DialogTitle>
          <DialogDescription id="cancel-dialog-description">
            Select the cancellation reason. The audit log records the operator action.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="mt-3 flex flex-col gap-2 text-sm" disabled={pending}>
          <legend className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Reason</legend>
          {REASONS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-[var(--surface-subtle)]">
              <input
                type="radio"
                name="cancel-reason"
                value={option.value}
                checked={reason === option.value}
                onChange={() => setReason(option.value)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>

        <label className="mt-3 flex flex-col gap-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Comment (optional)</span>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            disabled={pending}
            rows={3}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--focus)]"
          />
        </label>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>
            Keep
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => onConfirm({ reason, comment })}
            disabled={pending}
          >
            Cancel maintenance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
