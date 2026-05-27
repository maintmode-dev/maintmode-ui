export type ResourceType = "database" | "cluster" | "service" | "queue" | "cache" | "other";

export interface Resource {
  id: string;
  name: string;
  type: ResourceType;
  description?: string;
  owner?: string;
  archived?: boolean;
  created_at: string;
  updated_at: string;
}
