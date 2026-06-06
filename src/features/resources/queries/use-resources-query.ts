"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { bffFetch, BffError } from "@/features/_shared/api/bff-fetch";
import type { Resource } from "@/domain/resource/resource";

/**
 * Resource directory + detail + CRUD, wired BFF-only (RUK-158; no mock branch).
 * The list reads the backend's paginated `{ resources, limit, offset, total }`
 * window verbatim so callers can page through `total` rather than assume the
 * response holds every resource (EC-2). Archive/unarchive are idempotent and
 * reconcile the UI through query invalidation (EC-3).
 */

export interface ResourceListPage {
  resources: Resource[];
  limit: number;
  offset: number;
  total: number;
}

export interface ResourceListParams {
  /** Name filter forwarded to the backend's server-side contains match. */
  name?: string;
  /** When true, list archived resources instead of active ones. */
  archived?: boolean;
  limit?: number;
  offset?: number;
}

export function resourcesKey(params: ResourceListParams = {}) {
  return ["resources", params] as const;
}
export function resourceDetailKey(id: string) {
  return ["resource-detail", id] as const;
}

function listQueryString(params: ResourceListParams): string {
  const qs = new URLSearchParams();
  if (params.name) qs.set("name", params.name);
  if (params.archived) qs.set("archived", "true");
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export function useResourcesQuery(params: ResourceListParams = {}) {
  return useQuery({
    queryKey: resourcesKey(params),
    queryFn: (): Promise<ResourceListPage> =>
      bffFetch<ResourceListPage>(`/api/resources${listQueryString(params)}`),
    staleTime: 15_000,
  });
}

export function useResourceDetailQuery(id: string) {
  return useQuery({
    queryKey: resourceDetailKey(id),
    queryFn: (): Promise<Resource> => bffFetch<Resource>(`/api/resources/${encodeURIComponent(id)}`),
    retry: (failureCount, error) => {
      // 404/403 are terminal — a missing or forbidden resource won't appear on retry.
      if (error instanceof BffError && (error.status === 404 || error.status === 403)) {
        return false;
      }
      return failureCount < 1;
    },
    staleTime: 15_000,
  });
}

export interface CreateResourceInput {
  name: string;
  description?: string;
  external_id?: string;
}

export function useCreateResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateResourceInput): Promise<Resource> =>
      bffFetch<Resource>("/api/resources", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (resource) => {
      toast.success(`Resource “${resource.name}” created`);
      queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
    onError: (error) => {
      const msg =
        error instanceof BffError && error.status === 400
          ? error.message
          : "Couldn't create the resource. Try again.";
      toast.error(msg);
    },
  });
}

export interface UpdateResourceInput {
  id: string;
  name?: string;
  /** Pass `""` to set the description empty. */
  description?: string;
  /** Pass `""` to clear the stored external id. */
  external_id?: string;
}

export function useUpdateResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateResourceInput): Promise<Resource> =>
      bffFetch<Resource>(`/api/resources/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: (resource) => {
      toast.success("Resource updated");
      queryClient.invalidateQueries({ queryKey: resourceDetailKey(resource.id) });
      queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
    onError: (error) => {
      const msg =
        error instanceof BffError && error.status === 400
          ? error.message
          : "Couldn't update the resource. Try again.";
      toast.error(msg);
    },
  });
}

export function useArchiveResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }): Promise<void> =>
      bffFetch<void>(`/api/resources/${encodeURIComponent(id)}/${archive ? "archive" : "unarchive"}`, {
        method: "POST",
      }),
    onSuccess: (_, { id, archive }) => {
      toast.success(archive ? "Resource archived" : "Resource unarchived");
      queryClient.invalidateQueries({ queryKey: resourceDetailKey(id) });
      queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
    onError: (_error, { archive }) => {
      toast.error(`Couldn't ${archive ? "archive" : "unarchive"} the resource. Try again.`);
    },
  });
}
