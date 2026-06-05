/**
 * Temporary mock-only view of a resource.
 *
 * The domain `Resource` (`src/domain/resource/resource.ts`) was reconciled to
 * the backend shape in RUK-157 (core contract reconciliation), which dropped
 * the invented `type` / `owner` / `archived` fields the Phase-4 resource
 * screens render. Those screens are still `DATA_SOURCE.resources = "mock"` and
 * are rewired to the live backend (and the real shape) in RUK-158; until then
 * they consume this local type so the core task didn't have to rewrite them.
 *
 * Remove this file when RUK-158 wires the resource screens to the BFF.
 */
export type ResourceType = "database" | "cluster" | "service" | "queue" | "cache" | "other";

export interface MockResource {
  id: string;
  name: string;
  type: ResourceType;
  description?: string;
  owner?: string;
  archived?: boolean;
  created_at: string;
  updated_at: string;
}
