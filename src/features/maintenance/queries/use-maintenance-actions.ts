"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { bffFetch, BffError } from "@/features/_shared/api/bff-fetch";
import { DATA_SOURCE } from "@/features/_shared/api/data-source";
import type { CancelReason, Conflict } from "@/domain/maintenance/maintenance";

import { APPROVALS_KEY_PREFIX } from "@/features/approvals/queries/use-approvals-query";

import { maintenanceDetailKey } from "./use-maintenance-detail-query";

export type MaintenanceAction = "approve" | "start" | "complete";

interface ActionArgs {
  id: string;
  action: MaintenanceAction;
  /**
   * Observed integer revision, sent as `observed_maint_revision` on approve
   * for optimistic-concurrency. A stale value yields a 409.
   */
  revision?: number;
  /** The conflicts the operator saw, echoed back as `conflicts_snapshot`. */
  conflicts?: Conflict[];
}

/**
 * Drop every page of the "awaiting my approval" queue (RUK-215).
 *
 * Bare `["approvals"]` prefix on purpose: the query key is
 * `["approvals", offset]`, and a mutation has no idea which page the reviewer
 * is looking at — invalidating one offset would leave the rest stale.
 *
 * Not optional. The quick-sheet's Approve button is reachable straight from
 * `/approvals`, so approving never navigates away; with `staleTime: 30_000` and
 * `refetchOnWindowFocus: false` the approved row would keep sitting in the list
 * it was just removed from. And because a draft can legitimately linger in the
 * queue (there is no "return for rework" transition yet), the reviewer has no
 * way to tell a stale list from a true one.
 */
function invalidateApprovals(queryClient: ReturnType<typeof useQueryClient>): void {
  queryClient.invalidateQueries({ queryKey: APPROVALS_KEY_PREFIX });
}

/**
 * Build the `apimodels.ApproveDraftMaintRequest` body the backend expects for
 * approve. The browser sends the backend-shaped payload directly; the BFF
 * route forwards it unchanged.
 *
 * Exported for its own unit test: the payload shape IS the contract here, and
 * testing it through the mutation would mean a QueryClient and a `bffFetch` mob
 * just to read one JSON string.
 *
 * `revision ?? 0` is kept as-is, but note `observed_maint_revision` is
 * `validation.Required` on an int64 backend-side, so a literal 0 is rejected —
 * the fallback is a guaranteed 400 wearing the costume of a default. Every call
 * site passes `detail.revision` today; changing the mutation's contract is out
 * of scope for RUK-247 (SPEC §9).
 */
export function approveBody(revision: number | undefined, conflicts: Conflict[] | undefined): string {
  return JSON.stringify({
    observed_maint_revision: revision ?? 0,
    conflicts_snapshot: (conflicts ?? []).map((c) => ({
      maintenance_id: c.maintenance_id,
      overlap_start: c.overlap_start,
      overlap_end: c.overlap_end,
      // Both fall back defensively even though the domain type makes them
      // required: nothing RENDERS either field, so a non-conformant producer
      // (a hand-built fixture, a stale cached object) would surface here and
      // nowhere else. An absent `scope` is the worse of the two — it
      // serializes as a missing key and the backend's `validation.Required`
      // turns it into a 400, i.e. a silent regression of the very bug this
      // fixes.
      scope: c.scope ?? "global",
      // UNCONDITIONAL — do not gate this on `scope === "resource"`. A `global`
      // neighbour still carries a resource intersection, and the backend
      // fingerprints `resources` for every conflict regardless of scope, so
      // gating sends an empty set against a non-empty live one and approve
      // fails 409 — which reads like a concurrent edit, not like this bug
      // (SPEC §3.2.1). Ids only: the fingerprint hashes ids, and `name` would
      // double the payload against the BFF's 16 KB cap.
      resources: (c.resources ?? []).map((r) => ({ id: r.id })),
    })),
  });
}

/**
 * Explain a 409 from its backend error code. The codes are literal strings with
 * spaces (`httperrors.ErrorCode`), not SCREAMING_CASE, and reach us through
 * `BffError.code`.
 *
 * An unmapped code — an older backend, or one we have not taught this yet —
 * degrades to the previous generic wording rather than inventing a cause.
 */
function conflictMessage(code: string | undefined): string {
  switch (code) {
    case "conflicts changed since preview":
      // Deliberately avoids the phrase "this maintenance changed": a
      // neighbouring maintenance moved, this one did not.
      return "a conflicting maintenance moved. Refresh and try again.";
    case "maintenance changed since preview":
      return "this maintenance changed elsewhere. Refresh and try again.";
    case "concurrent modification":
      // Deliberately claims NO cause. The backend returns this only when
      // Postgres exhausted its SERIALIZABLE retries — nothing about the data is
      // wrong and nobody necessarily edited anything, so naming an editor would
      // invent a cause the same way "Appeared after approval" would.
      return "the server was busy. Please try again.";
    default:
      return "the maintenance changed elsewhere. Refresh and try again.";
  }
}

/**
 * Trigger a maintenance state transition. Toasts on 409 (revision diverged
 * → refetch) and 400 (validation), per the integration spec from Linear.
 */
export function useMaintenanceAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action, revision, conflicts }: ActionArgs) => {
      if (DATA_SOURCE.maintenanceWrites === "mock") {
        await new Promise((r) => setTimeout(r, 400));
        return { id, action };
      }
      const body = action === "approve" ? approveBody(revision, conflicts) : undefined;
      return bffFetch(`/api/maintenance/${encodeURIComponent(id)}/actions/${action}`, {
        method: "POST",
        body,
      });
    },
    onSuccess: (_, { id, action }) => {
      toast.success(`Maintenance ${action} succeeded`);
      queryClient.invalidateQueries({ queryKey: maintenanceDetailKey(id) });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      invalidateApprovals(queryClient);
    },
    onError: (error: unknown, { id, action }) => {
      if (error instanceof BffError) {
        if (error.status === 409) {
          // Name the actual cause. Approve fingerprints the surrounding
          // conflicts as well as this maintenance, and `observed_maint_revision`
          // guards only the latter — so most 409s here are a NEIGHBOUR moving,
          // which the old blanket "the maintenance changed elsewhere" reported
          // as an edit to this record. Refetching is right either way.
          toast.error(`Couldn't ${action}: ${conflictMessage(error.code)}`);
          queryClient.invalidateQueries({ queryKey: maintenanceDetailKey(id) });
          queryClient.invalidateQueries({ queryKey: ["calendar"] });
          invalidateApprovals(queryClient);
          return;
        }
        if (error.status === 413) {
          // The BFF caps the forwarded body at 16 KB and the approve payload
          // scales with conflicts × resources, so a heavily-conflicted
          // maintenance can cross it. Retrying is guaranteed to fail
          // identically, so the generic "Try again" below would be advice that
          // cannot work — name the real problem instead.
          toast.error(`Couldn't ${action}: too many conflicts to submit at once. Ask an admin.`);
          return;
        }
        if (error.status === 400) {
          toast.error(`Couldn't ${action}: ${error.message}`);
          return;
        }
      }
      toast.error(`Couldn't ${action}. Try again.`);
    },
  });
}

interface CancelArgs {
  id: string;
  reason: CancelReason;
  comment?: string;
}

export function useCancelMaintenance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason, comment }: CancelArgs) => {
      if (DATA_SOURCE.maintenanceWrites === "mock") {
        await new Promise((r) => setTimeout(r, 400));
        return { id };
      }
      return bffFetch(`/api/maintenance/${encodeURIComponent(id)}/actions/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason, comment }),
      });
    },
    onSuccess: (_, { id }) => {
      toast.success("Maintenance canceled");
      queryClient.invalidateQueries({ queryKey: maintenanceDetailKey(id) });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      // Cancel is the other way a draft leaves the queue — approve and cancel
      // are its only two exits today — so the list is just as stale after it.
      invalidateApprovals(queryClient);
    },
    onError: (error) => {
      const msg =
        error instanceof BffError && error.status === 400 ? error.message : "Couldn't cancel. Try again.";
      toast.error(msg);
    },
  });
}
