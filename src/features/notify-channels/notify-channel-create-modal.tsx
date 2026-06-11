"use client";

import { useState } from "react";

import { BffError } from "@/features/_shared/api/bff-fetch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/shadcn/dialog";
import { Combobox, type ComboboxOption } from "@/shared/ui/domain/combobox";
import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";

import { useCreateNotifyChannel } from "./queries/use-notify-channels-query";
import { useTransportsQuery } from "./queries/use-transports-query";
import { NotifyChannelField } from "./notify-channel-field";
import { FALLBACK_TRANSPORTS, transportDescriptor } from "./transports";

export interface NotifyChannelCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Create-channel modal. The transport picker drives the channel-id field below
 * it: selecting a transport sets that field's label, placeholder and helper
 * copy (from the UI transport descriptors) and clears any prior value, since an
 * id valid for one transport is meaningless for another. A 409 from the backend
 * (name already exists) is surfaced inline under Name rather than as a toast.
 */
export function NotifyChannelCreateModal({ open, onOpenChange }: NotifyChannelCreateModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [transport, setTransport] = useState("");
  const [channelId, setChannelId] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  const transportsQuery = useTransportsQuery();
  // Fall back to the hardcoded transports while the catalog loads or if it
  // errors — a channel can still be created against a known transport.
  const transports = transportsQuery.data ?? FALLBACK_TRANSPORTS;
  const createChannel = useCreateNotifyChannel();

  const descriptor = transport ? transportDescriptor(transport) : null;

  // Each option renders glyph + title + a one-line description, matching the
  // channel-create snapshot's reason-picker-style popover (and inheriting the
  // Combobox's autofocus search + `No results` empty state). `searchValue`
  // keeps both the id and title filterable as the catalog grows (BE-11).
  const transportOptions: ComboboxOption[] = transports.map((t) => {
    const d = transportDescriptor(t.id);
    const Glyph = d.icon;
    return {
      value: t.id,
      searchValue: `${t.title} ${t.id}`,
      label: (
        <span className="flex items-center gap-2">
          <Glyph className="size-3.5 shrink-0 text-fg-muted" aria-hidden={true} />
          {t.title}
        </span>
      ),
      description: d.channelIdLabel,
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New channel</DialogTitle>
          <DialogDescription>Create a channel to notify about maintenance windows.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
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

          <DialogFooter className="sm:justify-between sm:items-center">
            <p className="text-xs text-fg-dim">{footerHint}</p>
            <div className="flex gap-2">
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
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
