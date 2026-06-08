"use client";

import Link from "next/link";
import { Archive, ArchiveRestore, ArrowLeft, Edit2, Lock } from "lucide-react";
import { useState } from "react";

import { isNotifyChannelArchived, type NotifyChannel } from "@/domain/notify-channel/notify-channel";
import { Button } from "@/shared/ui/shadcn/button";
import { Stack } from "@/shared/ui/domain/stack";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/shadcn/tabs";
import { Input } from "@/shared/ui/shadcn/input";
import { Textarea } from "@/shared/ui/shadcn/textarea";
import { Skeleton } from "@/shared/ui/domain/skeleton";
import { TransportPill } from "@/shared/ui/domain/transport-pill";
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

import {
  useArchiveNotifyChannel,
  useNotifyChannelDetailQuery,
  useUpdateNotifyChannel,
} from "./queries/use-notify-channels-query";
import { NotifyChannelField } from "./notify-channel-field";
import { transportDescriptor } from "./transports";

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
      <div className="mx-auto max-w-[900px] p-6 space-y-3">
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

  return (
    <div className="mx-auto max-w-[900px] p-6 space-y-5">
      <header className="space-y-2">
        <Link href="/channels" className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
          <ArrowLeft className="size-3" aria-hidden="true" /> Back to channels
        </Link>
        <div className="flex items-center gap-3">
          <TransportPill transport={channel.transport} archived={archived} />
          <h1 className="h1">{channel.name}</h1>
          {archived ? <span className="body-sm text-fg-dim">(archived)</span> : null}
          <Tabs value={mode} onValueChange={(v) => setMode(v as "view" | "edit")} className="ml-auto">
            <TabsList>
              <TabsTrigger value="view">View</TabsTrigger>
              <TabsTrigger value="edit">Edit</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      {mode === "view" ? (
        <dl className="grid grid-cols-[160px_1fr] gap-y-3 gap-x-6 text-sm">
          <DT>Transport</DT>
          <DD>
            <TransportPill transport={channel.transport} archived={archived} />
          </DD>
          <DT>{descriptor.channelIdLabel}</DT>
          <DD className="font-mono">{channel.transportChannelId || "—"}</DD>
          <DT>Description</DT>
          <DD>{channel.description || "—"}</DD>
          <DT>Created</DT>
          <DD className="font-mono tabular-nums text-xs">{formatDateTime(channel.createdAt)}</DD>
          <DT>Last updated</DT>
          <DD className="font-mono tabular-nums text-xs">{formatDateTime(channel.updatedAt)}</DD>
        </dl>
      ) : (
        <NotifyChannelEditForm channel={channel} onClose={() => setMode("view")} />
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

function DT({ children }: { children: React.ReactNode }) {
  return (
    <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim pt-1">{children}</dt>
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
          disabled={!name.trim() || updateChannel.isPending}
        >
          {updateChannel.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
