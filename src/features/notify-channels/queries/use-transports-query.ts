"use client";

import { useQuery } from "@tanstack/react-query";

import { bffFetch } from "@/features/_shared/api/bff-fetch";

/** One transport option from the backend catalog (`{ id, title }`). */
export interface TransportOption {
  id: string;
  title: string;
}

/**
 * Supported notification transports for the channel-create picker (RUK-164).
 * The catalog is a stable reference list, so it is cached generously. Callers
 * fall back to `FALLBACK_TRANSPORTS` while this is loading or if it errors —
 * the field copy (label/placeholder/help) is sourced separately from the UI
 * transport descriptors, since the backend entry carries only id/title.
 */
export function useTransportsQuery() {
  return useQuery({
    queryKey: ["notify-transports"],
    queryFn: async (): Promise<TransportOption[]> => {
      const { transports } = await bffFetch<{ transports: { id?: string; title?: string }[] }>(
        "/api/notifications/transports",
      );
      return (transports ?? [])
        .filter((t): t is { id: string; title?: string } => typeof t.id === "string" && t.id.length > 0)
        .map((t) => ({ id: t.id, title: t.title || t.id }));
    },
    staleTime: 5 * 60_000,
  });
}
