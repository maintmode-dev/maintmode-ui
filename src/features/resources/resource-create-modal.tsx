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
import { Label } from "@/shared/ui/shadcn/label";
import { Textarea } from "@/shared/ui/shadcn/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/shadcn/select";
import type { ResourceType } from "@/domain/resource/resource";

export interface ResourceCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TYPES: { value: ResourceType; label: string }[] = [
  { value: "database", label: "Database" },
  { value: "cluster", label: "Cluster" },
  { value: "service", label: "Service" },
  { value: "queue", label: "Queue" },
  { value: "cache", label: "Cache" },
  { value: "other", label: "Other" },
];

export function ResourceCreateModal({ open, onOpenChange }: ResourceCreateModalProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ResourceType>("service");
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New resource</DialogTitle>
          <DialogDescription>Add a service, database, or cluster MaintMode should track.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onOpenChange(false);
          }}
        >
          <Field label="Name" htmlFor="r-name">
            <Input
              id="r-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. orders-db"
              required
              className="font-mono"
            />
          </Field>
          <Field label="Type" htmlFor="r-type">
            <Select value={type} onValueChange={(v) => setType(v as ResourceType)}>
              <SelectTrigger id="r-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Owner (optional)" htmlFor="r-owner">
            <Input
              id="r-owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="team or email"
            />
          </Field>
          <Field label="Description (optional)" htmlFor="r-desc">
            <Textarea
              id="r-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Create resource
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim">
        {label}
      </Label>
      {children}
    </div>
  );
}
