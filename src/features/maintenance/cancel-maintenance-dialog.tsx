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
import { StatusBadge } from "@/shared/ui/domain/status-badge";
import type { CancelReason, MaintenanceStatus } from "@/domain/maintenance/maintenance";

import { useCancelReasonsQuery } from "./queries/use-cancel-reasons-query";

export interface CancelMaintenanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maintenanceTitle: string;
  /** Mono id (MNT-xxxx) shown in the subline; falls back to the raw id. */
  maintenanceRef: string;
  /** Current status, rendered as a severity pill in the subline. */
  maintenanceStatus: MaintenanceStatus;
  pending?: boolean;
  onConfirm: (reason: CancelReason, comment: string) => void;
}

export function CancelMaintenanceDialog({
  open,
  onOpenChange,
  maintenanceTitle,
  maintenanceRef,
  maintenanceStatus,
  pending,
  onConfirm,
}: CancelMaintenanceDialogProps) {
  const [reason, setReason] = useState<CancelReason | undefined>(undefined);
  const [comment, setComment] = useState("");
  const reasonsQuery = useCancelReasonsQuery();
  const reasons = reasonsQuery.data ?? [];

  const COMMENT_MAX = 500;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-modal="true" aria-labelledby="cancel-dialog-title">
        <DialogHeader>
          <DialogTitle id="cancel-dialog-title">Cancel maintenance</DialogTitle>
          {/* Severity is signalled by the status pill, not extra "cannot be
              undone" copy (frozen decision). Subline = mono id · title + pill. */}
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-fg-muted">{maintenanceRef}</span>
              <span className="text-fg-dim" aria-hidden="true">
                ·
              </span>
              <span className="text-sm text-fg">{maintenanceTitle}</span>
              <StatusBadge status={maintenanceStatus} />
            </div>
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
              placeholder="Select a reason…"
              searchPlaceholder={`Search ${reasons.length} reasons…`}
              ariaLabel="Reason for cancellation"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <label
                htmlFor="cancel-comment"
                className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim"
              >
                Comment (optional)
              </label>
              <span className="font-mono tabular-nums text-[10px] text-fg-dim">
                {comment.length} / {COMMENT_MAX}
              </span>
            </div>
            {/* Comment is optional per the cancel contract (swagger
                `CancelMaintRequest.comment` is not required); submit gates on the
                reason alone. */}
            <Textarea
              id="cancel-comment"
              value={comment}
              maxLength={COMMENT_MAX}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add context for the audit log (e.g. linked incident, slack thread, postmortem)"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Keep maintenance
          </Button>
          <Button
            disabled={!reason || reasonsQuery.isPending || pending}
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
