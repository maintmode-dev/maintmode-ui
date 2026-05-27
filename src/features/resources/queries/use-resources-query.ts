"use client";

import { useQuery } from "@tanstack/react-query";

import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { DATA_SOURCE } from "@/features/_shared/api/data-source";
import { MOCK_RESOURCES } from "@/shared/mock/resources";
import type { Resource } from "@/domain/resource/resource";

export function resourcesKey() {
  return ["resources"] as const;
}
export function resourceDetailKey(id: string) {
  return ["resource-detail", id] as const;
}

export function useResourcesQuery() {
  return useQuery({
    queryKey: resourcesKey(),
    queryFn: async (): Promise<Resource[]> => {
      if (DATA_SOURCE.resources === "mock") {
        return MOCK_RESOURCES;
      }
      const data = await bffFetch<{ items: Resource[] }>("/api/resources");
      return data.items;
    },
  });
}

export function useResourceDetailQuery(id: string) {
  return useQuery({
    queryKey: resourceDetailKey(id),
    queryFn: async (): Promise<Resource> => {
      if (DATA_SOURCE.resourceDetail === "mock") {
        const found = MOCK_RESOURCES.find((r) => r.id === id);
        if (!found) {
          throw new Error("Resource not found");
        }
        return found;
      }
      return bffFetch<Resource>(`/api/resources/${encodeURIComponent(id)}`);
    },
  });
}
