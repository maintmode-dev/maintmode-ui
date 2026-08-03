"use client";

import Link from "next/link";
import { Archive, ArchiveRestore, ArrowLeft, Boxes } from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/ui/shadcn/button";
import { Stack } from "@/shared/ui/domain/stack";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/shadcn/tabs";
import { Input } from "@/shared/ui/shadcn/input";
import { Textarea } from "@/shared/ui/shadcn/textarea";
import { ArchiveStatusPill } from "@/shared/ui/domain/archive-status-pill";
import { CopyField } from "@/shared/ui/domain/copy-field";
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
import { formatUtc } from "@/shared/ui/lib/format";
import { isResourceArchived, type Resource, type ResourceActor } from "@/domain/resource/resource";

import { useRelatedMaintenanceQuery } from "@/features/calendar/queries/use-related-maintenance-query";

import { useArchiveResource, useResourceDetailQuery, useUpdateResource } from "./queries/use-resources-query";
import { ResourceField } from "./resource-field";
import { ResourceRelatedMaintenance } from "./resource-related-maintenance";
import { Skeleton } from "@/shared/ui/domain/skeleton";

export function ResourceDetailPage({ id }: { id: string }) {
  const query = useResourceDetailQuery(id);
  const resource = query.data;
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const archiveResource = useArchiveResource();

  // Related maintenance is fetched HERE, above the early returns, and handed to
  // the section as a prop. It only needs `id` — already in props — and hits an
  // unrelated endpoint, so gating it on the detail query (as it was when the
  // hook lived inside the section, rendered below the skeleton return and
  // behind `mode === "view"`) serialized two independent double hops. Both
  // requests now start on the same render. Do not move this below a `return`.
  const related = useRelatedMaintenanceQuery({ resourceId: id });

  if (query.isPending) {
    return (
      <div className="mx-auto max-w-[1100px] p-6 space-y-3">
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

  const archived = isResourceArchived(resource);

  return (
    <div className="mx-auto max-w-[1100px] p-6 space-y-5">
      <header className="space-y-2">
        <Link
          href="/resources"
          className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="size-3" aria-hidden="true" /> Back to resources
        </Link>
        <div className="flex items-center gap-3">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-bg-elev-2 text-fg-muted"
            aria-hidden="true"
          >
            <Boxes className="size-[18px]" />
          </span>
          <h1 className="h1 font-mono">{resource.name}</h1>
          <ArchiveStatusPill archived={archived} />
          <Tabs value={mode} onValueChange={(v) => setMode(v as "view" | "edit")} className="ml-auto">
            <TabsList>
              <TabsTrigger value="view">View</TabsTrigger>
              <TabsTrigger value="edit">Edit</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {/* No meta row (2026-06-09 contract change). The internal UUID is not
            shown — it lives in the URL for support deep-links — and every other
            identifier (external_id, Created/Updated) is a labelled cell in the
            Identity grid below. */}
      </header>

      {/* Identity card: identity-only grid (or the edit form) + a muted
          provenance footer. Created / Last updated are demoted from grid cells
          to the footer — audit timestamps are low-frequency reference, the
          product has a dedicated Audit log for depth (2026-06-09 contract).
          The card wrapper (border + bg-elev-1 + radius) separates this block
          from the Related maintenance section below. */}
      <div className="space-y-4 rounded-lg border border-border-subtle bg-bg-elev-1 p-6">
        {mode === "view" ? (
          <dl className="grid grid-cols-[180px_1fr] gap-y-3.5 gap-x-6 text-sm">
            <DT>Name</DT>
            <DD className="font-mono">{resource.name}</DD>
            <DT>External ID</DT>
            <DD>
              {resource.external_id ? (
                <CopyField value={resource.external_id} label="Copy external id" />
              ) : (
                "—"
              )}
            </DD>
            <DT>Description</DT>
            <DD>{resource.description || "—"}</DD>
          </dl>
        ) : (
          <ResourceEditForm resource={resource} onClose={() => setMode("view")} />
        )}

        {/* Provenance footer with authorship. `@handle` is appended
            only when the backend resolved an actor; it degrades gracefully to
            the bare timestamp otherwise (e.g. an unresolvable author). */}
        <p className="border-t border-border-subtle pt-3 font-mono text-[10px] text-fg-dim">
          Created <span className="tabular-nums">{formatUtc(resource.created_at)}</span>
          {resource.created_by ? <> · {actorHandle(resource.created_by)}</> : null}
          {resource.updated_at ? (
            <>
              {" · "}Updated <span className="tabular-nums">{formatUtc(resource.updated_at)}</span>
              {resource.updated_by ? <> · {actorHandle(resource.updated_by)}</> : null}
            </>
          ) : null}
        </p>
      </div>

      {/* Section 2 — Related maintenance. View-mode only; edit-mode replaces the
          identity grid with the form, so the related list is hidden there. */}
      {mode === "view" ? <ResourceRelatedMaintenance feed={related} /> : null}

      {/* View-mode footer only. Edit-mode is entered via the header View/Edit
          tablist (not a footer button), so the footer carries just the
          Archive / Unarchive action. Edit-mode supplies its own Discard / Save
          row inside ResourceEditForm. */}
      {mode === "view" ? (
        <footer className="flex items-center gap-2 pt-4 border-t border-border-subtle">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setArchiveOpen(true)}
            className="text-[var(--destructive-fg)] hover:bg-[var(--destructive-bg)]"
          >
            {archived ? (
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
      ) : null}

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{archived ? "Unarchive resource?" : "Archive resource?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {archived
                ? `“${resource.name}” will reappear in the active list and be available for new maintenances.`
                : `“${resource.name}” will be hidden from the active list. Existing maintenances are not affected.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiveResource.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={archiveResource.isPending}
              onClick={(e) => {
                e.preventDefault();
                archiveResource.mutate(
                  { id: resource.id, archive: !archived },
                  { onSuccess: () => setArchiveOpen(false) },
                );
              }}
            >
              {archived ? "Unarchive" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Render an actor as `@handle` for the provenance footer. Prefers the resolved
 * display name, falls back to the email local-part, then to `@unknown` when the
 * auth service couldn't resolve the author (backend degrades to "Unknown user").
 */
function actorHandle(actor: ResourceActor) {
  const handle = actor.displayName?.trim() || actor.email?.split("@")[0]?.trim() || "unknown";
  return <span>@{handle}</span>;
}

function DT({ children }: { children: React.ReactNode }) {
  return (
    <dt className="text-2xs font-semibold uppercase tracking-[0.08em] text-fg-dim pt-1.5">{children}</dt>
  );
}
function DD({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dd className={className}>{children}</dd>;
}

function ResourceEditForm({ resource, onClose }: { resource: Resource; onClose: () => void }) {
  const [name, setName] = useState(resource.name);
  const [externalId, setExternalId] = useState(resource.external_id ?? "");
  const [description, setDescription] = useState(resource.description ?? "");
  const updateResource = useUpdateResource();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    updateResource.mutate(
      {
        id: resource.id,
        name: trimmedName,
        description: description.trim(),
        // "" is forwarded as the backend's explicit clear signal for external_id.
        external_id: externalId.trim(),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <ResourceField label="Name" htmlFor="re-name">
        <Input
          id="re-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="font-mono"
        />
      </ResourceField>
      <ResourceField label="External ID" htmlFor="re-extid">
        <Input
          id="re-extid"
          value={externalId}
          onChange={(e) => setExternalId(e.target.value)}
          placeholder="upstream identifier"
          className="font-mono"
        />
      </ResourceField>
      <ResourceField label="Description" htmlFor="re-desc">
        <Textarea
          id="re-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
        />
      </ResourceField>
      <div className="flex gap-2 pt-2 border-t border-border-subtle">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={updateResource.isPending}>
          Discard
        </Button>
        <Button
          type="submit"
          size="sm"
          className="ml-auto"
          disabled={!name.trim() || updateResource.isPending}
        >
          {updateResource.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
