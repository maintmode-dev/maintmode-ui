import "server-only";

import type { Resource, ResourceType } from "@/domain/resource/models/resource";
import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import type {
  BackendResourceDto,
  BackendResourceType,
  BackendResourceTypesResponseDto,
  BackendResourcesResponseDto,
} from "@/server/backend/contracts/resources.contracts";

const BACKEND_RESOURCE_TYPES: readonly BackendResourceType[] = ["service", "database", "cluster"];

/**
 * Loads the maintenance resource catalog from the backend. Every call goes
 * through the authenticated BFF wrapper; the previous silent fallback to
 * a hard-coded mock list has been removed (RUK-18 mock policy). Mock-mode
 * UI surfacing belongs to the calendar shell, not this service.
 */
export async function loadResources(search = ""): Promise<Resource[]> {
  return fetchBackendResources(search);
}

export async function fetchBackendResources(search = ""): Promise<Resource[]> {
  const response = await authenticatedBackendRequest<BackendResourcesResponseDto>({
    method: "GET",
    path: `/api/v1/resources?name=${encodeURIComponent(search)}`,
  });

  const resources = response.resources ?? [];
  return resources.map((resource) => normalizeBackendResource(resource));
}

/**
 * Normalizes a backend resource into the domain shape. When the backend does
 * not expose `type` directly, we fall back to the catch-all `service` tag
 * instead of issuing an N+1 `/api/v1/resource/<id>/types` round trip per
 * resource — that pattern can saturate nginx connection limits and make the
 * calendar fail to load. The richer per-resource type lookup lives behind
 * `loadPrimaryResourceType` for callers that genuinely need it.
 */
export function normalizeBackendResource(resource: BackendResourceDto): Resource {
  return {
    id: resource.id,
    name: resource.name || resource.id,
    type: isBackendResourceType(resource.type) ? resource.type : "service",
  };
}

export function isBackendResourceType(value: unknown): value is BackendResourceType {
  return typeof value === "string" && BACKEND_RESOURCE_TYPES.includes(value as BackendResourceType);
}

export async function loadPrimaryResourceType(resourceId: string): Promise<ResourceType> {
  const response = await authenticatedBackendRequest<BackendResourceTypesResponseDto>({
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
