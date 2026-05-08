import "server-only";

import type { Resource, ResourceType } from "@/domain/resource/models/resource";
import { backendRequest } from "@/server/backend/client/backend-client";
import type {
  BackendResourceDto,
  BackendResourceType,
  BackendResourceTypesResponseDto,
  BackendResourcesResponseDto,
} from "@/server/backend/contracts/resources.contracts";
import { readMaintmodeBackendConfig } from "@/server/backend/config";

const LOCAL_DEV_MOCK_RESOURCES: Resource[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Mock service",
    type: "service",
  },
];

const BACKEND_RESOURCE_TYPES: readonly BackendResourceType[] = ["service", "database", "cluster"];

export async function loadResources(search = ""): Promise<Resource[]> {
  try {
    const resources = await fetchBackendResources(search);
    if (resources.length === 0 && readMaintmodeBackendConfig().enableMockData) {
      return LOCAL_DEV_MOCK_RESOURCES;
    }
    return resources;
  } catch (error) {
    if (readMaintmodeBackendConfig().enableMockData) {
      return LOCAL_DEV_MOCK_RESOURCES;
    }
    throw error;
  }
}

export async function fetchBackendResources(search = ""): Promise<Resource[]> {
  const response = await backendRequest<BackendResourcesResponseDto>({
    method: "GET",
    path: `/api/v1/resources?name=${encodeURIComponent(search)}`,
  });

  const resources = response.resources ?? [];
  return Promise.all(resources.map((resource) => normalizeBackendResource(resource)));
}

export async function normalizeBackendResource(resource: BackendResourceDto): Promise<Resource> {
  return {
    id: resource.id,
    name: resource.name || resource.id,
    type: isBackendResourceType(resource.type) ? resource.type : await loadPrimaryResourceType(resource.id),
  };
}

export function isBackendResourceType(value: unknown): value is BackendResourceType {
  return typeof value === "string" && BACKEND_RESOURCE_TYPES.includes(value as BackendResourceType);
}

async function loadPrimaryResourceType(resourceId: string): Promise<ResourceType> {
  const response = await backendRequest<BackendResourceTypesResponseDto>({
    method: "GET",
    path: `/api/v1/resource/${encodeURIComponent(resourceId)}/types`,
  });

  const types = response.types
    .map((item) => (typeof item === "string" ? item : item.type))
    .filter(isBackendResourceType);

  if (types.length === 0) {
    throw new Error(`Backend resource ${resourceId} does not expose a supported resource type`);
  }

  return types[0];
}
