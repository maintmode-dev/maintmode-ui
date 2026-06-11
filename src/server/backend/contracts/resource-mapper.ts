/**
 * Centralized backend → domain mappers for the resource read paths
 * (D-2: all BE↔UI mapping lives in `src/server/backend/**`). Pure, server-only
 * functions invoked from the resource BFF routes; the browser never sees the
 * wire shapes in `./maintmode-dto.ts`.
 *
 * `apimodels.Resource` is already close to the domain `Resource`: this layer
 * only fills the swagger-optional scalar fields with safe defaults so the UI
 * never has to guard against missing `name`/`status`/timestamps.
 */

import type { Resource, ResourceActor } from "@/domain/resource/resource";

import type { ListResourcesResponseDto, ResourceDto, UserSummaryDto } from "./maintmode-dto";

/** `uimodels.UserSummary` → domain actor, dropping the summary entirely when empty. */
function mapActor(dto: UserSummaryDto | undefined): ResourceActor | undefined {
  if (!dto) return undefined;
  if (dto.id == null && dto.email == null && dto.display_name == null) return undefined;
  return {
    id: dto.id,
    email: dto.email,
    displayName: dto.display_name,
  };
}

/** Domain projection of one resource list/detail item. */
export interface ResourceList {
  resources: Resource[];
  /** Echoed pagination window so the UI can read total without re-deriving it. */
  limit: number;
  offset: number;
  total: number;
}

/** `apimodels.Resource` → domain `Resource`, defaulting swagger-optional scalars. */
export function mapResource(dto: ResourceDto): Resource {
  return {
    id: dto.id,
    name: dto.name ?? "",
    description: dto.description,
    external_id: dto.external_id,
    // Free-text status drives `isResourceArchived`; default a missing value to
    // "" (neutral/unknown) rather than asserting an "active" lifecycle the
    // backend never sent — defaulting to "active" could mask an archived row.
    status: dto.status ?? "",
    created_at: dto.created_at ?? "",
    created_by: mapActor(dto.created_by),
    updated_at: dto.updated_at ?? "",
    updated_by: mapActor(dto.updated_by),
  };
}

/**
 * `GET /api/v1/resources/list` → domain list with its pagination window.
 *
 * `total` may exceed `resources.length` (EC-2): the list is one page, so the
 * window fields are carried through verbatim for the UI to paginate against
 * rather than assuming the response holds every resource. `total` defaults to
 * the page length only when the backend omits it.
 */
export function mapResourceList(dto: ListResourcesResponseDto): ResourceList {
  const resources = (dto.resources ?? []).map(mapResource);
  return {
    resources,
    limit: dto.limit ?? resources.length,
    offset: dto.offset ?? 0,
    total: dto.total ?? resources.length,
  };
}
