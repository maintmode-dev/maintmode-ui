/**
 * Backend wire contracts for the integrations registry admin endpoints
 * (RUK-196), mirroring `apimodels.*` in the maintmode swagger (Integrations
 * tag). Base URL = maintmode service (default `apiBaseUrl`).
 *
 * SERVER-ONLY: consumed by `./integrations-mapper.ts` and the admin BFF
 * routes; the browser sees only `src/domain/admin/integration.ts`.
 */

import type { UserSummaryDto } from "./maintmode-dto";

/** `apimodels.Integration` — masked read view; secrets only as is-set flags. */
export interface IntegrationDto {
  id: string;
  kind?: string;
  enabled?: boolean;
  config?: Record<string, unknown> | null;
  secrets_set?: Record<string, boolean> | null;
  created_at?: string;
  created_by?: UserSummaryDto | null;
  updated_at?: string;
  updated_by?: UserSummaryDto | null;
}

/** `apimodels.ListIntegrationsResponse`. */
export interface ListIntegrationsResponseDto {
  integrations?: IntegrationDto[] | null;
}
