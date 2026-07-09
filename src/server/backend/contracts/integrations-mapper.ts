/**
 * Integrations wire → domain mappers (D-2: all BE↔UI mapping lives in
 * `src/server/backend/**`). Pure, server-only functions invoked from the
 * admin BFF routes.
 *
 * Reconciliation handled here:
 *  - kind      : whitelisted against `slack | telegram | email`; unknown kinds
 *                are dropped from the list (the registry UI is a closed set).
 *  - config    : normalized to `{}` when null/absent.
 *  - secrets   : `secrets_set` normalized to `{}`; values are booleans only —
 *                a secret value can never appear here by construction.
 *  - authorship: `created_by`/`updated_by` collapse to display names via the
 *                shared `mapUserSummary` (same projection as maintenance).
 */

import { isIntegrationKind, type Integration } from "@/domain/admin/integration";

import { mapUserSummary } from "./maintenance-mapper";
import type { IntegrationDto, ListIntegrationsResponseDto } from "./integrations-dto";

/** Wire `Integration` → domain; `null` when the kind isn't a known registry kind. */
export function mapIntegration(dto: IntegrationDto): Integration | null {
  const kind = dto.kind ?? "";
  if (!isIntegrationKind(kind)) {
    return null;
  }
  return {
    id: dto.id,
    kind,
    enabled: dto.enabled ?? false,
    config: dto.config ?? {},
    secrets_set: dto.secrets_set ?? {},
    created_at: dto.created_at ?? "",
    created_by: dto.created_by ? mapUserSummary(dto.created_by) : undefined,
    updated_at: dto.updated_at ?? "",
    updated_by: dto.updated_by ? mapUserSummary(dto.updated_by) : undefined,
  };
}

/** Wire list envelope → domain list (unknown kinds dropped). */
export function mapIntegrationsList(dto: ListIntegrationsResponseDto): Integration[] {
  return (dto.integrations ?? []).map(mapIntegration).filter((i): i is Integration => i !== null);
}

/**
 * Single-object variant for routes that already whitelisted the kind: a null
 * here means the backend answered a validated request with an unknown kind —
 * a broken invariant, not a client error, so it throws (→ 500) instead of
 * letting the route 200 with a `null` body.
 */
export function mustMapIntegration(dto: IntegrationDto): Integration {
  const mapped = mapIntegration(dto);
  if (!mapped) {
    throw new Error(`backend returned unknown integration kind "${dto.kind ?? ""}"`);
  }
  return mapped;
}
