"use client";

import { useQuery } from "@tanstack/react-query";

import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { DATA_SOURCE } from "@/features/_shared/api/data-source";
import type { MaintenanceCancelReason } from "@/domain/maintenance/maintenance";

/**
 * Frozen fallback list — mirrors the backend `cancel-reasons` contract and
 * the values the UI can submit. Used as the `mock` branch and as the
 * placeholder/offline fallback while the live list loads or if it 500s.
 */
export const FALLBACK_CANCEL_REASONS: MaintenanceCancelReason[] = [
  {
    value: "conflict",
    title: "Conflicts with another window",
    description: "Resource overlap with another maintenance",
  },
  { value: "incident", title: "Active incident", description: "Production incident takes priority" },
  {
    value: "business_decision",
    title: "Business decision",
    description: "Postponed for non-technical reasons",
  },
  { value: "rescheduled", title: "Rescheduled", description: "Moved to a different window" },
  { value: "mistake", title: "Created in error", description: "Should not have been planned" },
];

export function cancelReasonsKey() {
  return ["cancel-reasons"] as const;
}

/**
 * Fetch the cancel reasons (title/description text) from the backend. Falls
 * back to {@link FALLBACK_CANCEL_REASONS} so the cancel dialog always has a
 * usable list — `placeholderData` covers the in-flight render and `mock`
 * mode, while the query stays cached for the session.
 */
export function useCancelReasonsQuery() {
  return useQuery({
    queryKey: cancelReasonsKey(),
    queryFn: async (): Promise<MaintenanceCancelReason[]> => {
      if (DATA_SOURCE.cancelReasons === "mock") {
        return FALLBACK_CANCEL_REASONS;
      }
      const data = await bffFetch<{ reasons: MaintenanceCancelReason[] }>("/api/maintenance/cancel-reasons");
      return data.reasons.length > 0 ? data.reasons : FALLBACK_CANCEL_REASONS;
    },
    placeholderData: FALLBACK_CANCEL_REASONS,
    staleTime: 5 * 60_000,
  });
}
