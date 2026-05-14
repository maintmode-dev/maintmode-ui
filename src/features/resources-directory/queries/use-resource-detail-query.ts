"use client";

import { useQuery } from "@tanstack/react-query";

import type { ResourceDirectoryItem } from "@/domain/resource/models/resource-directory";
import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { resourceDirectoryKeys } from "@/features/resources-directory/queries/query-keys";

export type ResourceDetailResponse = { resource: ResourceDirectoryItem };

export function useResourceDetailQuery(id: string) {
  return useQuery({
    queryKey: resourceDirectoryKeys.detail(id),
    queryFn: async ({ signal }) =>
      bffFetch<ResourceDetailResponse>(`/api/resources/directory/${encodeURIComponent(id)}`, {
        method: "GET",
        signal,
      }),
    enabled: Boolean(id),
    staleTime: 60 * 1000,
  });
}
