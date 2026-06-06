"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/shadcn/dialog";
import { Button } from "@/shared/ui/shadcn/button";
import { Textarea } from "@/shared/ui/shadcn/textarea";
import { Combobox } from "@/shared/ui/domain/combobox";
import type { CancelReason } from "@/domain/maintenance/maintenance";

import { useCancelReasonsQuery } from "./queries/use-cancel-reasons-query";

export interface CancelMaintenanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maintenanceTitle: string;
  pending?: boolean;
  onConfirm: (reason: CancelReason, comment: string) => void;
}

export function CancelMaintenanceDialog({
  open,
  onOpenChange,
  maintenanceTitle,
  pending,
  onConfirm,
}: CancelMaintenanceDialogProps) {
  const [reason, setReason] = useState<CancelReason | undefined>(undefined);
  const [comment, setComment] = useState("");
  const reasonsQuery = useCancelReasonsQuery();
  const reasons = reasonsQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel maintenance</DialogTitle>
          <DialogDescription>
            “{maintenanceTitle}” will be marked as canceled. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim">
              Reason
            </label>
            <Combobox
              options={reasons.map((r) => ({
                value: r.value,
                label: r.title,
                description: r.description,
              }))}
              value={reason}
              onChange={(v) => setReason(v as CancelReason)}
              placeholder="Pick a reason…"
              ariaLabel="Cancel reason"
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="cancel-comment"
              className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim"
            >
              Comment (optional)
            </label>
            <Textarea
              id="cancel-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add context for the audit trail."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Keep maintenance
          </Button>
          <Button
            disabled={!reason || pending}
            onClick={() => reason && onConfirm(reason, comment)}
            className="bg-[var(--destructive-solid)] hover:bg-[var(--destructive-solid-hover)] text-white"
          >
            {pending ? "Canceling…" : "Cancel maintenance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
