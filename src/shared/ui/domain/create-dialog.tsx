"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/shadcn/dialog";
import { Separator } from "@/shared/ui/shadcn/separator";
import { cn } from "@/shared/ui/lib/cn";

export interface CreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /**
   * When set, the body/footer children are wrapped in a `<form>` so Enter
   * submits and the primary action can stay `type="submit"`. Screens that
   * save via a click handler (integrations) simply omit it.
   */
  onSubmit?: (e: React.FormEvent) => void;
  /** Compose the content from `CreateDialogBody` + `CreateDialogFooter`. */
  children: React.ReactNode;
}

/**
 * Shared shell for the entity-creation dialogs (resource / channel / invite /
 * integration): centered modal, 560px, header → scrollable body → pinned
 * footer. This is the single source of the create-dialog canon — screens
 * supply only their fields and footer content, never their own
 * `DialogContent` layout.
 *
 * Compound by design: the footer often depends on state that lives inside a
 * remount-keyed body (see the integration dialog's secret drafts), so body
 * and footer are children-level components rather than props of the shell.
 */
export function CreateDialog({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  children,
}: CreateDialogProps) {
  // Body/footer wrapper: a form when the screen submits natively, a plain
  // div otherwise. Same layout classes either way.
  const wrapperClass = "flex min-h-0 flex-1 flex-col overflow-hidden";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* aria-modal is explicit: Radix conveys modality by aria-hiding the
          background (hideOthers), not by setting the attribute itself. */}
      <DialogContent
        aria-modal="true"
        className="sm:max-w-[560px] bg-bg-elev-1 flex max-h-[85vh] flex-col gap-0 p-0"
      >
        <DialogHeader className="px-6 pt-6 pb-3 gap-1">
          <DialogTitle className="h2">{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <Separator />
        {onSubmit ? (
          <form className={wrapperClass} onSubmit={onSubmit}>
            {children}
          </form>
        ) : (
          <div className={wrapperClass}>{children}</div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export interface CreateDialogBodyProps {
  children: React.ReactNode;
  /** Extra classes for the scroll container (e.g. a different `space-y`). */
  className?: string;
}

/** Scrollable field area of a create dialog. */
export function CreateDialogBody({ children, className }: CreateDialogBodyProps) {
  return <div className={cn("flex-1 overflow-y-auto px-6 py-4 space-y-4", className)}>{children}</div>;
}

export interface CreateDialogFooterProps {
  /** Contextual hint shown on the left ("Enter a name to continue."). */
  hint?: React.ReactNode;
  /** Actions on the right: Cancel + primary. */
  children: React.ReactNode;
}

/** Pinned footer of a create dialog: hint left, actions right. */
export function CreateDialogFooter({ hint, children }: CreateDialogFooterProps) {
  return (
    <>
      <Separator />
      <div data-slot="create-dialog-footer" className="flex flex-row items-center justify-between px-6 py-4">
        <p className="min-w-0 pr-4 text-xs text-fg-dim">{hint}</p>
        <div className="flex shrink-0 gap-2">{children}</div>
      </div>
    </>
  );
}
