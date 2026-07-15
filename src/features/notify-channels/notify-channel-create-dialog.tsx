"use client";

import { TriangleAlert } from "lucide-react";
import { useState } from "react";

import type { NotifyTransportStatus } from "@/domain/notify-channel/notify-channel";
import { BffError } from "@/features/_shared/api/bff-fetch";
import { CreateDialog, CreateDialogBody, CreateDialogFooter } from "@/shared/ui/domain/create-dialog";
import { Combobox, type ComboboxOption } from "@/shared/ui/domain/combobox";
import { Alert, AlertDescription } from "@/shared/ui/shadcn/alert";
import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";

import { useCreateNotifyChannel } from "./queries/use-notify-channels-query";
import { useTransportsQuery } from "./queries/use-transports-query";
import { NotifyChannelField } from "./notify-channel-field";
import { FALLBACK_TRANSPORTS, transportDescriptor, transportStatusCopy } from "./transports";

export interface NotifyChannelCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Create-channel form, rendered in the shared `CreateDialog` shell (centered
 * 560px dialog — the canon for all entity-creation screens). The transport picker drives the channel-id field
 * below it: selecting a transport sets that field's label, placeholder and
 * helper copy (from the UI transport descriptors) and clears any prior value,
 * since an id valid for one transport is meaningless for another. A 409 from
 * the backend (name already exists) is surfaced inline under Name rather than
 * as a toast.
 */
export function NotifyChannelCreateDialog({ open, onOpenChange }: NotifyChannelCreateDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [transport, setTransport] = useState("");
  const [channelId, setChannelId] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  const transportsQuery = useTransportsQuery();
  // Fall back to the hardcoded transports while the catalog loads or if it
  // errors — a channel can still be created against a known transport. The
  // fallback entries carry no `transportStatus` (no catalog data = no signal),
  // so the picker only decorates statuses it actually received.
  const transports: { id: string; title: string; transportStatus?: NotifyTransportStatus }[] =
    transportsQuery.data ?? FALLBACK_TRANSPORTS;
  const createChannel = useCreateNotifyChannel();

  const descriptor = transport ? transportDescriptor(transport) : null;
  // Delivery warning for the SELECTED transport. The binding is
  // weak — a non-ok transport stays selectable (the admin may configure the
  // integration later) — but the silent-drop consequence must be visible.
  const selected = transport ? transports.find((t) => t.id === transport) : undefined;
  const selectedStatusCopy =
    selected?.transportStatus != null ? transportStatusCopy(selected.transportStatus) : null;

  // Each option renders glyph + title + a one-line description, matching the
  // channel-create snapshot's reason-picker-style popover (and inheriting the
  // Combobox's autofocus search + `No results` empty state). `searchValue`
  // keeps both the id and title filterable as the catalog grows.
  // Non-ok transports render dimmed with the status as their description —
  // marked but selectable (weak binding).
  const transportOptions: ComboboxOption[] = transports.map((t) => {
    const d = transportDescriptor(t.id);
    const Glyph = d.icon;
    const statusCopy = t.transportStatus != null ? transportStatusCopy(t.transportStatus) : null;
    return {
      value: t.id,
      searchValue: `${t.title} ${t.id}`,
      label: (
        <span className={`flex items-center gap-2 ${statusCopy ? "text-fg-muted" : ""}`}>
          <Glyph className="size-3.5 shrink-0 text-fg-muted" aria-hidden={true} />
          {t.title}
          {statusCopy ? (
            <TriangleAlert className="size-3 shrink-0 text-[var(--impact-partial-fg)]" aria-hidden={true} />
          ) : null}
        </span>
      ),
      description: statusCopy ? statusCopy.badge : d.channelIdLabel,
    };
  });

  const reset = () => {
    setName("");
    setDescription("");
    setTransport("");
    setChannelId("");
    setNameError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleTransportChange = (next: string) => {
    setTransport(next);
    // Clear the channel id: a Slack id is not a valid Telegram chat id.
    setChannelId("");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setNameError(null);
    const trimmedName = name.trim();
    const trimmedChannelId = channelId.trim();
    if (!trimmedName || !transport || !trimmedChannelId) return;
    createChannel.mutate(
      {
        name: trimmedName,
        transport,
        transportChannelId: trimmedChannelId,
        description: description.trim() || undefined,
      },
      {
        onSuccess: () => handleOpenChange(false),
        onError: (error) => {
          if (error instanceof BffError && error.status === 409) {
            setNameError("A channel with this name already exists.");
          }
        },
      },
    );
  };

  const channelIdLabel = descriptor?.channelIdLabel ?? "Channel ID";
  const canSubmit = !!name.trim() && !!transport && !!channelId.trim() && !createChannel.isPending;

  // Footer contextual hint (contract): priority-ordered nudge toward the next
  // required field, then a ready confirmation once the form can submit.
  const footerHint = !name.trim()
    ? "Enter a name to continue."
    : !transport
      ? "Select a transport to continue."
      : !channelId.trim()
        ? `Enter the ${channelIdLabel.toLowerCase()} to continue.`
        : "Notifications will be sent to this channel.";

  return (
    <CreateDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="New channel"
      description="Create a channel to notify about maintenance windows."
      onSubmit={submit}
    >
      <CreateDialogBody>
        <NotifyChannelField
          label="Name"
          htmlFor="c-name"
          help="A human-readable label. Shown in lists, pickers, and audit logs."
          error={nameError ?? undefined}
        >
          <Input
            id="c-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError(null);
            }}
            placeholder="e.g. Ops alerts"
            required
            maxLength={100}
            aria-invalid={nameError ? true : undefined}
            aria-describedby="c-name-desc"
          />
        </NotifyChannelField>

        <NotifyChannelField
          label="Description (optional)"
          htmlFor="c-desc"
          help="Optional. Metadata only — not a runbook."
          counter={`${description.length} / 200`}
        >
          <Input
            id="c-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Notifies the on-call team"
            maxLength={200}
          />
        </NotifyChannelField>

        <NotifyChannelField
          label="Transport"
          help="Where notifications are delivered. Picking one sets the field below."
        >
          <Combobox
            value={transport}
            onChange={handleTransportChange}
            options={transportOptions}
            placeholder="Select a transport…"
            searchPlaceholder={`Search ${transportOptions.length} transports…`}
            emptyText="No transports match your search."
            ariaLabel="Select a transport"
          />
          {selectedStatusCopy ? (
            // Compact inline warning under the picker. Alert's default role="alert"
            // is correct here — it appears dynamically on selection, so screen
            // readers should announce it. Detail-only (no title); tightened to the
            // form's xs scale.
            <Alert variant="warning" className="mt-2 px-3 py-2 text-xs [&>svg]:size-3.5">
              <TriangleAlert aria-hidden="true" />
              <AlertDescription className="text-xs">
                {selectedStatusCopy.detail(selected?.title ?? transport)}
              </AlertDescription>
            </Alert>
          ) : null}
        </NotifyChannelField>

        <NotifyChannelField
          label={channelIdLabel}
          htmlFor="c-channel-id"
          help={descriptor?.channelIdHelp ?? "Select a transport first."}
        >
          <Input
            id="c-channel-id"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            placeholder={descriptor?.channelIdPlaceholder ?? ""}
            disabled={!transport}
            required
            maxLength={200}
            className="font-mono"
            aria-describedby="c-channel-id-desc"
          />
        </NotifyChannelField>
      </CreateDialogBody>
      <CreateDialogFooter hint={footerHint}>
        <Button
          type="button"
          variant="outline"
          onClick={() => handleOpenChange(false)}
          disabled={createChannel.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {createChannel.isPending ? "Creating…" : "Create channel"}
        </Button>
      </CreateDialogFooter>
    </CreateDialog>
  );
}
