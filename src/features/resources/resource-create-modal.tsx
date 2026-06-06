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
import { Input } from "@/shared/ui/shadcn/input";
import { Textarea } from "@/shared/ui/shadcn/textarea";

import { useCreateResource } from "./queries/use-resources-query";
import { ResourceField } from "./resource-field";

export interface ResourceCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ResourceCreateModal({ open, onOpenChange }: ResourceCreateModalProps) {
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New resource</DialogTitle>
          <DialogDescription>Add a service, database, or cluster MaintMode should track.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <ResourceField label="Name" htmlFor="r-name">
            <Input
              id="r-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. orders-db"
              required
              className="font-mono"
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
          <ResourceField label="Description (optional)" htmlFor="r-desc">
            <Textarea
              id="r-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </ResourceField>
          <DialogFooter>
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
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
