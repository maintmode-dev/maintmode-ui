"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { bffFetch, BffError } from "@/features/_shared/api/bff-fetch";
import type { NotifyChannel } from "@/domain/notify-channel/notify-channel";

/**
 * Notification-channel catalog + detail + CRUD, wired BFF-only (no mock
 * branch). The list endpoint answers a plain `{ channels }` envelope with
 * no pagination window — the catalog is small and returned whole, sorted
 * newest-first by the backend. Archive/unarchive are idempotent and reconcile
 * the UI through query invalidation.
 */

export interface NotifyChannelListParams {
  /** When true, include archived channels (backend `include_archived=true`). */
  archived?: boolean;
}

export function notifyChannelsKey(params: NotifyChannelListParams = {}) {
  return ["notify-channels", params] as const;
}
export function notifyChannelDetailKey(id: string) {
  return ["notify-channel-detail", id] as const;
}

function listQueryString(params: NotifyChannelListParams): string {
  const qs = new URLSearchParams();
  if (params.archived) qs.set("archived", "true");
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export function useNotifyChannelsQuery(params: NotifyChannelListParams = {}) {
  return useQuery({
    queryKey: notifyChannelsKey(params),
    queryFn: async (): Promise<NotifyChannel[]> => {
      const { channels } = await bffFetch<{ channels: NotifyChannel[] }>(
        `/api/notifications/channels${listQueryString(params)}`,
      );
      return channels;
    },
    staleTime: 15_000,
  });
}

export function useNotifyChannelDetailQuery(id: string) {
  return useQuery({
    queryKey: notifyChannelDetailKey(id),
    queryFn: (): Promise<NotifyChannel> =>
      bffFetch<NotifyChannel>(`/api/notifications/channels/${encodeURIComponent(id)}`),
    retry: (failureCount, error) => {
      // 404/403 are terminal — a missing or forbidden channel won't appear on retry.
      if (error instanceof BffError && (error.status === 404 || error.status === 403)) {
        return false;
      }
      return failureCount < 1;
    },
    staleTime: 15_000,
  });
}

export interface CreateNotifyChannelInput {
  name: string;
  transport: string;
  transportChannelId: string;
  description?: string;
}

export function useCreateNotifyChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateNotifyChannelInput): Promise<NotifyChannel> =>
      bffFetch<NotifyChannel>("/api/notifications/channels", {
        method: "POST",
        // BFF expects the wire field name for the channel id.
        body: JSON.stringify({
          name: input.name,
          transport: input.transport,
          transport_channel_id: input.transportChannelId,
          description: input.description,
        }),
      }),
    onSuccess: (channel) => {
      toast.success(`Channel “${channel.name}” created`);
      queryClient.invalidateQueries({ queryKey: ["notify-channels"] });
    },
    // 409 (name collision) is surfaced inline by the modal, so it is rethrown
    // (no toast) for that case; other failures get a generic toast.
    onError: (error) => {
      if (error instanceof BffError && error.status === 409) return;
      const msg =
        error instanceof BffError && error.status === 400
          ? error.message
          : "Couldn't create the channel. Try again.";
      toast.error(msg);
    },
  });
}

export interface UpdateNotifyChannelInput {
  id: string;
  name?: string;
  /** Pass `""` to set the description empty. */
  description?: string;
  transportChannelId?: string;
}

export function useUpdateNotifyChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, transportChannelId, ...patch }: UpdateNotifyChannelInput): Promise<NotifyChannel> =>
      bffFetch<NotifyChannel>(`/api/notifications/channels/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...patch,
          ...(transportChannelId !== undefined ? { transport_channel_id: transportChannelId } : {}),
        }),
      }),
    onSuccess: (channel) => {
      toast.success("Channel updated");
      queryClient.invalidateQueries({ queryKey: notifyChannelDetailKey(channel.id) });
      queryClient.invalidateQueries({ queryKey: ["notify-channels"] });
    },
    onError: (error) => {
      if (error instanceof BffError && error.status === 409) return;
      const msg =
        error instanceof BffError && error.status === 400
          ? error.message
          : "Couldn't update the channel. Try again.";
      toast.error(msg);
    },
  });
}

export function useArchiveNotifyChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }): Promise<void> =>
      bffFetch<void>(
        `/api/notifications/channels/${encodeURIComponent(id)}/${archive ? "archive" : "unarchive"}`,
        { method: "POST" },
      ),
    onSuccess: (_, { id, archive }) => {
      toast.success(archive ? "Channel archived" : "Channel unarchived");
      queryClient.invalidateQueries({ queryKey: notifyChannelDetailKey(id) });
      queryClient.invalidateQueries({ queryKey: ["notify-channels"] });
    },
    onError: (_error, { archive }) => {
      toast.error(`Couldn't ${archive ? "archive" : "unarchive"} the channel. Try again.`);
    },
  });
}
