"use client";

import { useQuery } from "@tanstack/react-query";

import type { ResourceDirectoryItem } from "@/domain/resource/models/resource-directory";
import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { resourceDirectoryKeys } from "@/features/resources-directory/queries/query-keys";

export type ResourceDirectoryResponse = { resources: ResourceDirectoryItem[] };

export function useResourceDirectoryQuery(search = "") {
  return useQuery({
    queryKey: resourceDirectoryKeys.search(search),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      if (search) {
        params.set("name", search);
      }
      const path = params.size > 0
        ? `/api/resources/directory?${params.toString()}`
        : "/api/resources/directory";
      return bffFetch<ResourceDirectoryResponse>(path, { method: "GET", signal });
    },
    staleTime: 60 * 1000,
  });
}
