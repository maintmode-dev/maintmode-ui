/**
 * Canonical directory representation of a backend Resource, distinct from the
 * maintenance-view `Resource` in `resource.ts` (which only carries id/name/type
 * for calendar filtering). The directory item exposes the richer fields the
 * resource browser/card needs.
 */
export type ResourceDirectoryItem = {
  id: string;
  name: string;
  description: string;
  externalId?: string;
  createdAt: string;
  updatedAt?: string;
};
