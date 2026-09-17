import "server-only";

import { BffValidationError } from "@/server/backend/errors/bff-error";
import { isRoutableIntegrationPair, type IntegrationCategory } from "@/domain/admin/integration";

/**
 * The `(kind, name)` pair the integrations BFF routes accept.
 *
 * Shared by the item routes rather than repeated in each, because it is a
 * security control and copies of a control drift. It answers exactly one
 * question — may this request reach the backend — and it answers it the same
 * way for GET, PATCH, DELETE, toggle and test-send.
 *
 * ## It now admits both halves of the registry
 *
 * It used to admit `notify` only, because this frontend proxied no login routes
 * and forwarding a real `client_secret` toward a path the BFF does not serve
 * would have been worse than refusing it. Those routes exist now, so the narrow
 * gate would only break the forms that need them.
 *
 * What did not change: this is still a closed list, still checked before the
 * backend is touched, and still the SAME predicate the create route and the
 * dialog's save guard use. That last part is the point — there were four
 * hand-written conditions here and they had already drifted apart.
 *
 * The pair, not the name, is what gets checked: `slack` is routable under
 * `notify` and not under `login`, and the backend refuses the mismatched pair
 * too.
 */
export type IntegrationRouteParams = {
  kind: IntegrationCategory;
  name: string;
};

/** Resolve and whitelist the `[kind]/[name]` segments before touching the backend. */
export async function resolveIntegrationParams(
  params: Promise<{ kind: string; name: string }>,
): Promise<IntegrationRouteParams> {
  const { kind, name } = await params;
  if (!isRoutableIntegrationPair(kind, name)) {
    // One message for both halves of the pair. Naming which half was wrong
    // would tell an unauthenticated prober which categories and names exist;
    // an operator reaching this from the UI cannot produce it at all, because
    // the UI only ever sends pairs it rendered.
    throw new BffValidationError([{ field: "name", message: "Unknown integration" }]);
  }
  return { kind: kind as IntegrationCategory, name };
}

/**
 * Cap on a forwarded integrations body, matched to the backend's own.
 *
 * The backend caps this route group at 64 KiB and answers a larger body from
 * middleware, before the handler — so the response is not the JSON error
 * envelope the UI knows how to read. Refusing the same size here turns that
 * into a field error the form can show.
 *
 * Sized to the backend's limit rather than to the payload, deliberately: a
 * tighter cap would refuse bodies the backend accepts. It exists to stop an
 * unbounded buffered read on a path that now carries a real `client_secret`,
 * not to second-guess what a valid config may contain.
 */
export const INTEGRATION_MAX_BODY_BYTES = 64 * 1024;
