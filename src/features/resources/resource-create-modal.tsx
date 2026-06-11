"use client";

import { useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/shadcn/sheet";
import { Separator } from "@/shared/ui/shadcn/separator";
import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";
import { Textarea } from "@/shared/ui/shadcn/textarea";

import { useCreateResource } from "./queries/use-resources-query";
import { ResourceField } from "./resource-field";

export interface ResourceCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Create-resource form. Rendered as a right-side 560px sheet (sheet-shell
 * pattern, per the frozen design decision) rather than a centered modal — the
 * channel create modal stays centered, but resources open in a side sheet.
 * Field order is Name → Description → External ID per the contract.
 */
export function ResourceCreateModal({ open, onOpenChange }: ResourceCreateModalProps) {
  const [name, setName] = useState("");
  const [externalId, setExternalId] = useState("");
  const [description, setDescription] = useState("");
  const createResource = useCreateResource();

  // Clear the form when the sheet closes so a prior draft doesn't linger when
  // it reopens. Done in the open-change handler rather than an effect to avoid
  // a setState-in-effect cascade.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setName("");
      setExternalId("");
      setDescription("");
    }
    onOpenChange(next);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    createResource.mutate(
      {
        name: trimmed,
        description: description.trim() || undefined,
        external_id: externalId.trim() || undefined,
      },
      { onSuccess: () => handleOpenChange(false) },
    );
  };

  const footerHint = !name.trim() ? "Enter a name to continue." : "Ready to add to the catalog.";

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="sm:max-w-[560px] flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-3 gap-1">
          <SheetTitle className="h2">New resource</SheetTitle>
          <SheetDescription>
            Add a service, database, or cluster MaintMode should track.
          </SheetDescription>
        </SheetHeader>
        <Separator />
        <form className="flex flex-1 flex-col overflow-hidden" onSubmit={submit}>
          <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
            <ResourceField label="Name" htmlFor="r-name">
              <Input
                id="r-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. orders-db"
                required
                autoFocus
                className="font-mono"
              />
            </ResourceField>
            <ResourceField
              label="Description (optional)"
              htmlFor="r-desc"
              counter={`${description.length} / 500`}
            >
              <Textarea
                id="r-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={4}
              />
            </ResourceField>
            <ResourceField label="External ID (optional)" htmlFor="r-extid">
              <Input
                id="r-extid"
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
                placeholder="upstream identifier"
                className="font-mono"
              />
            </ResourceField>
          </div>
          <Separator />
          <SheetFooter className="flex-row items-center justify-between px-6 py-4">
            <p className="text-xs text-fg-dim">{footerHint}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={createResource.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim() || createResource.isPending}>
                {createResource.isPending ? "Creating…" : "Create resource"}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
