"use client";

import Link from "next/link";
import { Archive, ArchiveRestore, ArrowLeft, Edit2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/ui/shadcn/button";
import { Stack } from "@/shared/ui/domain/stack";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/shadcn/tabs";
import { Input } from "@/shared/ui/shadcn/input";
import { Textarea } from "@/shared/ui/shadcn/textarea";
import { Label } from "@/shared/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/shadcn/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/shadcn/alert-dialog";
import { formatDateTime } from "@/shared/ui/lib/format";

import { useResourceDetailQuery } from "./queries/use-resources-query";
import { Skeleton } from "@/shared/ui/domain/skeleton";
import type { ResourceType } from "@/domain/resource/resource";

export function ResourceDetailPage({ id }: { id: string }) {
  const query = useResourceDetailQuery(id);
  const resource = query.data;
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [archiveOpen, setArchiveOpen] = useState(false);

  if (query.isPending) {
    return (
      <div className="mx-auto max-w-[900px] p-6 space-y-3">
        <Skeleton type="row" width="40%" />
        <Skeleton type="block" />
      </div>
    );
  }
  if (!resource) {
    return (
      <div className="p-10">
        <Stack
          icon={null}
          title="Resource not found"
          caption="This resource does not exist or has been deleted."
          cta={
            <Button asChild variant="outline" size="sm">
              <Link href="/resources">
                <ArrowLeft className="size-3" aria-hidden="true" /> Back to resources
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[900px] p-6 space-y-5">
      <header className="space-y-2">
        <Link
          href="/resources"
          className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="size-3" aria-hidden="true" /> Back to resources
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="h1 font-mono">{resource.name}</h1>
          <Tabs value={mode} onValueChange={(v) => setMode(v as "view" | "edit")} className="ml-auto">
            <TabsList>
              <TabsTrigger value="view">View</TabsTrigger>
              <TabsTrigger value="edit">Edit</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <p className="body-sm">
          <span className="capitalize">{resource.type}</span>
          {resource.archived ? <span className="ml-2 text-fg-dim">(archived)</span> : null}
        </p>
      </header>

      {mode === "view" ? (
        <dl className="grid grid-cols-[140px_1fr] gap-y-3 gap-x-6 text-sm">
          <DT>Owner</DT>
          <DD>{resource.owner ?? "—"}</DD>
          <DT>Description</DT>
          <DD>{resource.description ?? "—"}</DD>
          <DT>Created</DT>
          <DD className="font-mono tabular-nums text-xs">{formatDateTime(resource.created_at)}</DD>
          <DT>Last updated</DT>
          <DD className="font-mono tabular-nums text-xs">{formatDateTime(resource.updated_at)}</DD>
        </dl>
      ) : (
        <ResourceEditForm resource={resource} onClose={() => setMode("view")} />
      )}

      <footer className="flex items-center gap-2 pt-4 border-t border-border-subtle">
        <Button variant="outline" size="sm" onClick={() => setMode("edit")}>
          <Edit2 className="size-3.5" aria-hidden="true" /> Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setArchiveOpen(true)}
          className="text-[var(--destructive-fg)] hover:bg-[var(--destructive-bg)]"
        >
          {resource.archived ? (
            <>
              <ArchiveRestore className="size-3.5" aria-hidden="true" /> Unarchive
            </>
          ) : (
            <>
              <Archive className="size-3.5" aria-hidden="true" /> Archive
            </>
          )}
        </Button>
      </footer>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {resource.archived ? "Unarchive resource?" : "Archive resource?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {resource.archived
                ? `“${resource.name}” will reappear in the active list and be available for new maintenances.`
                : `“${resource.name}” will be hidden from the active list. Existing maintenances are not affected.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction>{resource.archived ? "Unarchive" : "Archive"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DT({ children }: { children: React.ReactNode }) {
  return (
    <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim pt-1">{children}</dt>
  );
}
function DD({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dd className={className}>{children}</dd>;
}

function ResourceEditForm({
  resource,
  onClose,
}: {
  resource: { name: string; type: string; description?: string; owner?: string };
  onClose: () => void;
}) {
  const [name, setName] = useState(resource.name);
  const [type, setType] = useState(resource.type as ResourceType);
  const [description, setDescription] = useState(resource.description ?? "");
  const [owner, setOwner] = useState(resource.owner ?? "");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <Field label="Name" htmlFor="re-name">
        <Input
          id="re-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="font-mono"
        />
      </Field>
      <Field label="Type" htmlFor="re-type">
        <Select value={type} onValueChange={(v) => setType(v as ResourceType)}>
          <SelectTrigger id="re-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["database", "cluster", "service", "queue", "cache", "other"].map((t) => (
              <SelectItem key={t} value={t} className="capitalize">
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Owner" htmlFor="re-owner">
        <Input id="re-owner" value={owner} onChange={(e) => setOwner(e.target.value)} />
      </Field>
      <Field label="Description" htmlFor="re-desc">
        <Textarea
          id="re-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </Field>
      <div className="flex gap-2 pt-2 border-t border-border-subtle">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Discard
        </Button>
        <Button type="submit" size="sm" className="ml-auto">
          Save changes
        </Button>
      </div>
    </form>
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
