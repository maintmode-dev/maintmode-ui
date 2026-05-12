"use client";

import { useQuery } from "@tanstack/react-query";

import type { Resource } from "@/domain/resource/models/resource";
import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { resourcesQueryKeys } from "@/features/resources/queries/query-keys";

export type ResourcesQueryResponse = {
  resources: Resource[];
};

export function useResourcesQuery(search = "") {
  return useQuery({
    queryKey: resourcesQueryKeys.search(search),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      if (search) {
        params.set("name", search);
      }
      const path = params.size > 0 ? `/api/resources?${params.toString()}` : "/api/resources";
      return bffFetch<ResourcesQueryResponse>(path, { method: "GET", signal });
    },
    staleTime: 5 * 60 * 1000,
  });
}
