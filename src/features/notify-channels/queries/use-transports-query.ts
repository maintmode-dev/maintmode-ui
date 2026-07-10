"use client";

import { useQuery } from "@tanstack/react-query";

import type { NotifyTransportStatus } from "@/domain/notify-channel/notify-channel";
import { normalizeTransportStatus } from "@/domain/notify-channel/notify-channel";
import { bffFetch } from "@/features/_shared/api/bff-fetch";

/** One transport option from the catalog, as mapped by the BFF (`NotifyTransport`). */
export interface TransportOption {
  id: string;
  title: string;
  /** Delivery health of the transport's integration (RUK-199), fail-visible default. */
  transportStatus: NotifyTransportStatus;
}

/**
 * Supported notification transports for the channel-create picker (RUK-164).
 * The catalog is a stable reference list, so it is cached generously. Callers
 * fall back to `FALLBACK_TRANSPORTS` while this is loading or if it errors —
 * the field copy (label/placeholder/help) still comes from the UI transport
 * descriptors keyed by id. Wire→domain mapping happens in the BFF route (D-2);
 * the normalize here is a defensive re-apply (idempotent) so a stale or
 * hand-rolled BFF response can never smuggle a missing status past the UI.
 */
export function useTransportsQuery() {
  return useQuery({
    queryKey: ["notify-transports"],
    queryFn: async (): Promise<TransportOption[]> => {
      const { transports } = await bffFetch<{
        transports: { id?: string; title?: string; transportStatus?: string }[];
      }>("/api/notifications/transports");
      return (transports ?? [])
        .filter((t): t is typeof t & { id: string } => typeof t.id === "string" && t.id.length > 0)
        .map((t) => ({
          id: t.id,
          title: t.title || t.id,
          transportStatus: normalizeTransportStatus(t.transportStatus),
        }));
    },
    staleTime: 5 * 60_000,
  });
}
