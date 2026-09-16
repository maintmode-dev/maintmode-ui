/**
 * Integrations wire → domain mappers (D-2: all BE↔UI mapping lives in
 * `src/server/backend/**`). Pure, server-only functions invoked from the
 * admin BFF routes.
 *
 * Reconciliation handled here:
 *  - kind      : whitelisted against the two CATEGORIES (`notify`/`login`).
 *                A row in a category this frontend does not know is dropped —
 *                and logged, see below.
 *  - name      : the system, carried through; `""` when the wire omits it.
 *  - health    : narrowed to the closed enum, left `undefined` otherwise.
 *                Never defaulted — see below.
 *  - config    : normalized to `{}` when null/absent.
 *  - secrets   : `secrets_set` normalized to `{}`; values are booleans only —
 *                a secret value can never appear here by construction.
 *  - authorship: `created_by`/`updated_by` collapse to display names via the
 *                shared `mapUserSummary` (same projection as maintenance).
 *
 * ## Why the drops are logged (RUK-304)
 *
 * This module caused an incident by dropping rows in silence. The predicate
 * tested `kind` against system names; when the backend started sending
 * categories it matched nothing, every row was discarded on a 200, and the
 * screen — which renders from a static list — told administrators with working
 * integrations that nothing was configured. A failure with no signal is worse
 * than a 4xx, because nothing distinguishes hidden data from absent data.
 *
 * The drop policy itself was right and is kept. What was wrong was the
 * predicate, and what was missing was the announcement. `console.error` here
 * follows `resolve-auth-providers.ts`, which reports its own degradation the
 * same way. Payload is system names only — no PII.
 *
 * ## Why `health` is never defaulted
 *
 * It is `omitempty` and present for login rows only, so absence means "not
 * applicable", not "ok". `?? "ok"` would report an inapplicable field as a
 * healthy one. An unrecognised value is dropped rather than passed through, for
 * the reason `sign-in-method.ts` gives about unknown method types: a state this
 * frontend does not understand must never render as a working one.
 */

import {
  isIntegrationCategory,
  isIntegrationHealth,
  type Integration,
  type IntegrationHealth,
} from "@/domain/admin/integration";

import { mapUserSummary } from "./maintenance-mapper";
import type { IntegrationDto, ListIntegrationsResponseDto } from "./integrations-dto";

/** Narrow the wire `health`, announcing a value this build does not know. */
function mapHealth(dto: IntegrationDto): IntegrationHealth | undefined {
  const health = dto.health;
  if (health === undefined || health === "") {
    return undefined;
  }
  if (!isIntegrationHealth(health)) {
    console.error("[integrations-mapper] unrecognised health", {
      kind: dto.kind ?? "",
      name: dto.name ?? "",
      health,
    });
    return undefined;
  }
  return health;
}

/** Wire `Integration` → domain; `null` when the category isn't a known one. */
export function mapIntegration(dto: IntegrationDto): Integration | null {
  const kind = dto.kind ?? "";
  if (!isIntegrationCategory(kind)) {
    console.error("[integrations-mapper] dropped a row with an unknown category", {
      kind,
      name: dto.name ?? "",
    });
    return null;
  }
  return {
    id: dto.id,
    kind,
    name: dto.name ?? "",
    enabled: dto.enabled ?? false,
    config: dto.config ?? {},
    secrets_set: dto.secrets_set ?? {},
    health: mapHealth(dto),
    created_at: dto.created_at ?? "",
    created_by: dto.created_by ? mapUserSummary(dto.created_by) : undefined,
    updated_at: dto.updated_at ?? "",
    updated_by: dto.updated_by ? mapUserSummary(dto.updated_by) : undefined,
  };
}

/** Wire list envelope → domain list (unknown categories dropped and logged). */
export function mapIntegrationsList(dto: ListIntegrationsResponseDto): Integration[] {
  return (dto.integrations ?? []).map(mapIntegration).filter((i): i is Integration => i !== null);
}

/**
 * Single-object variant for routes that already whitelisted the request: a null
 * here means the backend answered a validated request with an unknown category
 * — a broken invariant, not a client error, so it throws (→ 500) instead of
 * letting the route 200 with a `null` body.
 *
 * The two predicates are no longer identical, and that is deliberate. A route
 * admits one pair, `(notify, <one of three names>)`; this mapper admits any
 * known category. The mapper is therefore strictly WIDER, which is the
 * direction that keeps the throw unreachable against a well-behaved backend.
 * Were it ever narrowed below the routes, a legitimate answer would 500.
 */
export function mustMapIntegration(dto: IntegrationDto): Integration {
  const mapped = mapIntegration(dto);
  if (!mapped) {
    throw new Error(`backend returned unknown integration category "${dto.kind ?? ""}"`);
  }
  return mapped;
}
