/**
 * Resource domain model, shaped per swagger `apimodels.Resource`.
 *
 * The backend dropped the invented `type` / `owner` / `archived` fields the
 * Phase-4 UI used: it carries `external_id` and a free-text `status` instead,
 * and archival is a state (`status`) toggled via dedicated endpoints, not a
 * boolean. Wiring the resource screens to this shape is RUK-158; until then
 * those screens use a temporary mock-view type (see
 * `src/shared/mock/mock-resource.ts`).
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
