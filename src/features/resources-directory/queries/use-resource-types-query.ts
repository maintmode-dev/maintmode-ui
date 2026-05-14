"use client";

import { useQuery } from "@tanstack/react-query";

import type { ResourceType } from "@/domain/resource/models/resource";
import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { resourceDirectoryKeys } from "@/features/resources-directory/queries/query-keys";

export type ResourceTypesResponse = { types: ResourceType[] };

export function useResourceTypesQuery(id: string) {
  return useQuery({
    queryKey: resourceDirectoryKeys.types(id),
    queryFn: async ({ signal }) =>
      bffFetch<ResourceTypesResponse>(`/api/resources/directory/${encodeURIComponent(id)}/types`, {
        method: "GET",
        signal,
      }),
    enabled: Boolean(id),
    staleTime: 5 * 60 * 1000,
  });
}
