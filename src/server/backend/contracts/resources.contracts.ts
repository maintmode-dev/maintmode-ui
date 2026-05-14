export type BackendResourceType = "service" | "database" | "cluster";

export type BackendResourceDto = {
  id: string;
  name: string;
  type?: BackendResourceType;
};

export type BackendResourceRefDto = {
  id: string;
  type: BackendResourceType;
};

export type BackendResourceTypeDto = {
  type: BackendResourceType;
};

export type BackendResourcesResponseDto = {
  resources: BackendResourceDto[];
};

export type BackendResourceTypesResponseDto = {
  types: Array<BackendResourceType | BackendResourceTypeDto>;
};

/**
 * Rich resource shape returned by `GET /api/v1/resources` and
 * `POST /api/v1/resource/create`. The minimal `BackendResourceDto` above is
 * intentionally kept for the maintenance calendar projection.
 */
export type BackendResourceDirectoryDto = {
  id: string;
  name: string;
  description: string;
  external_id?: string;
  created_at: string;
  updated_at?: string;
};

export type BackendResourceDirectoryResponseDto = {
  resources: BackendResourceDirectoryDto[];
};

export type BackendCreateResourceRequestDto = {
  name: string;
  description: string;
  external_id?: string;
};
