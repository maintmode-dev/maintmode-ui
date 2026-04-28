export type ResourceKind = "service" | "host" | "cluster" | "other";

export type Resource = {
  id: string;
  name: string;
  kind: ResourceKind;
};
