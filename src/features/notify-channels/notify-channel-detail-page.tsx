"use client";

import Link from "next/link";
import { Archive, ArchiveRestore, ArrowLeft, Lock, TriangleAlert } from "lucide-react";
import { useState } from "react";

import {
  isNotifyChannelArchived,
  type NotifyChannel,
  type NotifyChannelActor,
} from "@/domain/notify-channel/notify-channel";
import { Button } from "@/shared/ui/shadcn/button";
import { Stack } from "@/shared/ui/domain/stack";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/shadcn/tabs";
import { Input } from "@/shared/ui/shadcn/input";
import { Textarea } from "@/shared/ui/shadcn/textarea";
import { Skeleton } from "@/shared/ui/domain/skeleton";
import { TransportPill } from "@/shared/ui/domain/transport-pill";
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

import {
  useArchiveNotifyChannel,
  useNotifyChannelDetailQuery,
  useUpdateNotifyChannel,
} from "./queries/use-notify-channels-query";
import { NotifyChannelField } from "./notify-channel-field";
import { NotifyChannelRelatedMaintenance } from "./notify-channel-related-maintenance";
import { transportDescriptor, transportDisplayTitle, transportStatusCopy } from "./transports";

/**
 * Channel detail (`/channels/[id]`) — sibling of the resource detail page.
 * Transport is read-only everywhere (immutable on the backend); edit-mode only
 * exposes name / description / channel id. Archive and unarchive go through a
 * confirm dialog; there is no delete (soft-archive only).
 */
export function NotifyChannelDetailPage({ id }: { id: string }) {
  const query = useNotifyChannelDetailQuery(id);
  const channel = query.data;
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const archiveChannel = useArchiveNotifyChannel();

  if (query.isPending) {
    return (
      <div className="mx-auto max-w-[1100px] p-6 space-y-3">
        <Skeleton type="row" width="40%" />
        <Skeleton type="block" />
      </div>
    );
  }
  if (!channel) {
    return (
      <div className="p-10">
        <Stack
          icon={null}
          title="Channel not found"
          caption="This channel may have been removed or the link is incorrect."
          cta={
            <Button asChild variant="outline" size="sm">
              <Link href="/channels">
                <ArrowLeft className="size-3" aria-hidden="true" /> Back to channels
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const archived = isNotifyChannelArchived(channel);
  const descriptor = transportDescriptor(channel.transport);
  // null for "ok"; anything else — disabled / not_configured / an unknown
  // status — renders the delivery warning below the header (RUK-199).
  const statusCopy = transportStatusCopy(channel.transportStatus);

  return (
    <div className="mx-auto max-w-[1100px] p-6 space-y-5">
      <header className="space-y-2">
        <Link href="/channels" className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
          <ArrowLeft className="size-3" aria-hidden="true" /> Back to channels
        </Link>
        <div className="flex items-center gap-3">
          <TransportPill transport={channel.transport} archived={archived} />
          <h1 className="h1">{channel.name}</h1>
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
            identifier (transport channel id, Created/Updated · @handle) is a
            labelled cell in the Identity grid below. */}
      </header>

      {/* Delivery warning (RUK-199): the transport↔integration binding is weak,
          so a channel on a disabled / unconfigured integration exists happily
          while its notifications are silently dropped. This callout is the
          admin's only signal. Inline hand-rolled block — the project has no
          banner primitive (AlertDialog is modal-only) and this is the first
          surface needing one. Copy pending design review (SPEC.md). */}
      {statusCopy ? (
        // role="status", not "alert": the callout is statically present on load
        // (screen readers announce alerts only when they appear dynamically).
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-[var(--impact-partial-border)] bg-[var(--impact-partial-bg)] px-4 py-3 text-sm text-fg"
        >
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0 text-[var(--impact-partial-fg)]"
            aria-hidden="true"
          />
          <div className="space-y-0.5">
            <div className="font-medium">{statusCopy.badge}</div>
            <div className="text-fg-muted">{statusCopy.detail(transportDisplayTitle(channel.transport))}</div>
          </div>
        </div>
      ) : null}

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
            <DD>{channel.name}</DD>
            <DT>Transport</DT>
            <DD>
              <TransportPill transport={channel.transport} archived={archived} />
            </DD>
            <DT>Description</DT>
            <DD>{channel.description || "—"}</DD>
            <DT>{descriptor.channelIdLabel}</DT>
            <DD>
              {channel.transportChannelId ? (
                <CopyField
                  value={channel.transportChannelId}
                  label={`Copy ${descriptor.channelIdLabel.toLowerCase()}`}
                />
              ) : (
                "—"
              )}
            </DD>
          </dl>
        ) : (
          <NotifyChannelEditForm channel={channel} onClose={() => setMode("view")} />
        )}

        <p className="border-t border-border-subtle pt-3 font-mono text-[10px] text-fg-dim">
          Created <span className="tabular-nums">{formatUtc(channel.createdAt)}</span> ·{" "}
          {actorHandle(channel.createdBy)}
          {channel.updatedAt ? (
            <>
              {" · "}Updated <span className="tabular-nums">{formatUtc(channel.updatedAt)}</span> ·{" "}
              {actorHandle(channel.updatedBy)}
            </>
          ) : null}
        </p>
      </div>

      {/* Section 2 — Related maintenance. View-mode only; edit-mode replaces the
          identity grid with the form, so the related list is hidden there. */}
      {mode === "view" ? <NotifyChannelRelatedMaintenance channelId={channel.id} /> : null}

      {/* View-mode footer only. Edit-mode is entered via the header View/Edit
          tablist (not a footer button), so the footer carries just the
          Archive / Unarchive action. Edit-mode supplies its own Discard / Save
          row inside NotifyChannelEditForm. */}
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
            <AlertDialogTitle>
              {archived ? "Unarchive this channel?" : "Archive this channel?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {archived
                ? `“${channel.name}” will reappear in the catalog and be selectable for new maintenances.`
                : "Archived channels stay visible in historical maintenance but won't appear when creating new ones."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiveChannel.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={archiveChannel.isPending}
              onClick={(e) => {
                e.preventDefault();
                archiveChannel.mutate(
                  { id: channel.id, archive: !archived },
                  { onSuccess: () => setArchiveOpen(false) },
                );
              }}
            >
              {archived ? "Unarchive" : "Archive channel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Render an actor as `@handle` for the meta row. Prefers the resolved display
 * name, falls back to the email local-part, then to `@unknown` when the auth
 * service couldn't resolve the author (backend degrades to "Unknown user").
 */
function actorHandle(actor?: NotifyChannelActor) {
  const handle = actor?.displayName?.trim() || actor?.email?.split("@")[0]?.trim() || "unknown";
  return <span className="font-mono">@{handle}</span>;
}

function DT({ children }: { children: React.ReactNode }) {
  return (
    <dt className="text-2xs font-semibold uppercase tracking-[0.08em] text-fg-dim pt-1.5">{children}</dt>
  );
}
function DD({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dd className={className}>{children}</dd>;
}

function NotifyChannelEditForm({ channel, onClose }: { channel: NotifyChannel; onClose: () => void }) {
  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description ?? "");
  const [channelId, setChannelId] = useState(channel.transportChannelId);
  const updateChannel = useUpdateNotifyChannel();
  const descriptor = transportDescriptor(channel.transport);

  // Transport is immutable, so only these three fields can differ from the
  // loaded channel. Save stays disabled until at least one of them does.
  const isDirty =
    name !== channel.name ||
    description !== (channel.description ?? "") ||
    channelId !== channel.transportChannelId;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    updateChannel.mutate(
      {
        id: channel.id,
        name: trimmedName,
        description: description.trim(),
        transportChannelId: channelId.trim(),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <NotifyChannelField label="Name" htmlFor="ce-name">
        <Input id="ce-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
      </NotifyChannelField>
      <NotifyChannelField
        label="Transport"
        help={
          <span className="inline-flex items-center gap-1">
            <Lock className="size-3" aria-hidden="true" /> Transport can&apos;t be changed after creation.
          </span>
        }
      >
        <TransportPill transport={channel.transport} />
      </NotifyChannelField>
      <NotifyChannelField label={descriptor.channelIdLabel} htmlFor="ce-channel-id">
        <Input
          id="ce-channel-id"
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          placeholder={descriptor.channelIdPlaceholder}
          className="font-mono"
          maxLength={200}
        />
      </NotifyChannelField>
      <NotifyChannelField label="Description" htmlFor="ce-desc">
        <Textarea
          id="ce-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={200}
        />
      </NotifyChannelField>
      <div className="flex gap-2 pt-2 border-t border-border-subtle">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={updateChannel.isPending}>
          Discard
        </Button>
        <Button
          type="submit"
          size="sm"
          className="ml-auto"
          disabled={!name.trim() || !isDirty || updateChannel.isPending}
        >
          {updateChannel.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
