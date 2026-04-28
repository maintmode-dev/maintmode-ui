export type BackendResourceDto = {
  id: string;
  name: string;
  kind: "service" | "host" | "cluster" | "other";
};
