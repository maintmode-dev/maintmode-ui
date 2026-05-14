"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { ResourceDirectoryItem } from "@/domain/resource/models/resource-directory";
import { bffFetch } from "@/features/_shared/api/bff-fetch";
import { resourceDirectoryKeys } from "@/features/resources-directory/queries/query-keys";
import { resourcesQueryKeys } from "@/features/resources/queries/query-keys";
import type { ResourceCreateInput } from "@/features/resources-directory/schemas/resource-create-schema";

type CreateResourceResponse = { resource: ResourceDirectoryItem };

export function useCreateResourceMutation() {
  const queryClient = useQueryClient();
  return useMutation<ResourceDirectoryItem, Error, ResourceCreateInput>({
    mutationFn: async (input) => {
      const body: ResourceCreateInput = {
        name: input.name,
        description: input.description,
      };
      if (input.external_id) {
        body.external_id = input.external_id;
      }
      const response = await bffFetch<CreateResourceResponse>("/api/resources", {
        method: "POST",
        body,
      });
      return response.resource;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: resourceDirectoryKeys.all }),
        queryClient.invalidateQueries({ queryKey: resourcesQueryKeys.all }),
      ]);
    },
  });
}
