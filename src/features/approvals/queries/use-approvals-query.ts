"use client";

import { useQuery } from "@tanstack/react-query";

import { bffFetch, BffError } from "@/features/_shared/api/bff-fetch";
import type { ApprovalsPage } from "@/domain/maintenance/approval";

/**
 * Page size. Mirrors the BFF, which pins the backend `limit` rather than
 * forwarding a client value — kept here only so the query key and the
 * "is there a second page" check agree with what the server actually returns.
 */
export const APPROVALS_PAGE_SIZE = 50;

/**
 * Prefix-shaped on purpose: `["approvals", offset]` lets a mutation invalidate
 * the whole queue with the bare `["approvals"]` prefix, without knowing which
 * page the reviewer happens to be on. `use-maintenance-actions` relies on that.
 */
/**
 * Prefix shared by every page of the queue. Exported so mutations can drop the
 * whole queue without importing a specific page's key — `approvalsKey` needs an
 * offset, and a mutation has no idea which page is on screen.
 */
export const APPROVALS_KEY_PREFIX = ["approvals"] as const;

export function approvalsKey(offset: number) {
  return [...APPROVALS_KEY_PREFIX, offset] as const;
}

export function useApprovalsQuery(offset: number) {
  return useQuery({
    queryKey: approvalsKey(offset),
    queryFn: (): Promise<ApprovalsPage> => bffFetch<ApprovalsPage>(`/api/approvals?offset=${offset}`),
    retry: (failureCount, error) => {
      // 401 never reaches here (bffFetch redirects to /login instead of
      // rejecting). 403 is terminal: it means this account's roles don't carry
      // maintenance.approve, which retrying cannot change.
      if (error instanceof BffError && (error.status === 401 || error.status === 403)) {
        return false;
      }
      return failureCount < 1;
    },
    staleTime: 15_000,
  });
}
