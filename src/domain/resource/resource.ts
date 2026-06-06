/**
 * Resource domain model, shaped per swagger `apimodels.Resource`.
 *
 * The backend dropped the invented `type` / `owner` / `archived` fields the
 * Phase-4 UI used: it carries `external_id` and a free-text `status` instead,
 * and archival is a state (`status`) toggled via dedicated endpoints, not a
 * boolean. The resource screens consume this shape directly (RUK-158).
 */
export interface Resource {
  id: string;
  name: string;
  description?: string;
  /** Operator-facing external identifier (free-text), optional. */
  external_id?: string;
  /** Free-text lifecycle status, e.g. "active" / "archived". */
  status: string;
  created_at: string;
  updated_at: string;
}

/** Lifecycle status the backend uses to mark a resource as archived. */
export const ARCHIVED_STATUS = "archived";

/**
 * True when a resource is in the archived lifecycle state. `status` is
 * free-text, so the comparison normalizes case and surrounding whitespace to
 * stay robust if the backend returns e.g. "Archived" or " archived ".
 */
export function isResourceArchived(resource: Pick<Resource, "status">): boolean {
  return resource.status.trim().toLowerCase() === ARCHIVED_STATUS;
}
