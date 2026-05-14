import "server-only";

import type { ResourceDirectoryItem } from "@/domain/resource/models/resource-directory";
import type { ResourceType } from "@/domain/resource/models/resource";
import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { BackendRequestError } from "@/server/backend/errors/backend-request-error";
import type {
  BackendCreateResourceRequestDto,
  BackendResourceDirectoryDto,
  BackendResourceDirectoryResponseDto,
  BackendResourceTypesResponseDto,
} from "@/server/backend/contracts/resources.contracts";
import { isBackendResourceType } from "@/server/backend/resources/resources-service";

export async function loadResourceDirectory(search = ""): Promise<ResourceDirectoryItem[]> {
  const response = await authenticatedBackendRequest<BackendResourceDirectoryResponseDto>({
    method: "GET",
    path: `/api/v1/resources?name=${encodeURIComponent(search)}`,
  });
  return (response.resources ?? []).map(normalizeBackendResourceDirectory);
}

/**
 * Backend has no GET-by-id endpoint; we search by name (which currently also
 * accepts id-substring matches per swagger) and pick an exact id match. If the
 * backend later exposes a dedicated lookup, swap the implementation here.
 */
export async function loadResourceDirectoryItem(id: string): Promise<ResourceDirectoryItem> {
  const all = await loadResourceDirectory("");
  const found = all.find((item) => item.id === id);
  if (!found) {
    throw new BackendRequestError(404, JSON.stringify({ code: "NOT_FOUND", message: "Resource not found" }));
  }
  return found;
}

export async function loadResourceTypes(id: string): Promise<ResourceType[]> {
  const response = await authenticatedBackendRequest<BackendResourceTypesResponseDto>({
    method: "GET",
    path: `/api/v1/resource/${encodeURIComponent(id)}/types`,
  });

  return response.types
    .map((item) => (typeof item === "string" ? item : item.type))
    .filter(isBackendResourceType);
}

export async function createResource(
  input: BackendCreateResourceRequestDto,
): Promise<ResourceDirectoryItem> {
  const response = await authenticatedBackendRequest<BackendResourceDirectoryDto>({
    method: "POST",
    path: "/api/v1/resource/create",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  return normalizeBackendResourceDirectory(response);
}

export function normalizeBackendResourceDirectory(
  dto: BackendResourceDirectoryDto,
): ResourceDirectoryItem {
  return {
    id: dto.id,
    name: dto.name ?? dto.id,
    description: dto.description ?? "",
    externalId: dto.external_id || undefined,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at || undefined,
  };
}
