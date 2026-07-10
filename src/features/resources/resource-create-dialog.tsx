"use client";

import { useState } from "react";

import { CreateDialog, CreateDialogBody, CreateDialogFooter } from "@/shared/ui/domain/create-dialog";
import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";
import { Textarea } from "@/shared/ui/shadcn/textarea";

import { useCreateResource } from "./queries/use-resources-query";
import { ResourceField } from "./resource-field";

export interface ResourceCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Create-resource form, rendered in the shared `CreateDialog` shell (centered
 * 560px modal — the canon for all entity-creation screens).
 * Field order is Name → Description → External ID per the contract.
 */
export function ResourceCreateDialog({ open, onOpenChange }: ResourceCreateDialogProps) {
  const [name, setName] = useState("");
  const [externalId, setExternalId] = useState("");
  const [description, setDescription] = useState("");
  const createResource = useCreateResource();

  // Clear the form when the dialog closes so a prior draft doesn't linger when
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
    <CreateDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="New resource"
      description="Add a service, database, or cluster MaintMode should track."
      onSubmit={submit}
    >
      <CreateDialogBody>
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
      </CreateDialogBody>
      <CreateDialogFooter hint={footerHint}>
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
      </CreateDialogFooter>
    </CreateDialog>
  );
}
