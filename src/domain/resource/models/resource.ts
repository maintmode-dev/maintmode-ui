export type ResourceType = "service" | "database" | "cluster";

export type Resource = {
  id: string;
  name: string;
  type: ResourceType;
};
