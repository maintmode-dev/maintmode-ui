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
