import "server-only";

import { BffValidationError } from "@/server/backend/errors/bff-error";
import { isNotifyIntegrationName, type NotificationIntegrationName } from "@/domain/admin/integration";

/**
 * The `(kind, name)` pair the integrations BFF routes accept.
 *
 * Shared by the three item routes rather than repeated in each, because it is a
 * security control and three copies of a control drift. It answers exactly one
 * question — may this request reach the backend — and it answers it the same way
 * for GET, PATCH, toggle and test-send.
 *
 * ## Deliberately narrower than the backend
 *
 * The backend serves both categories. This whitelist admits `notify` only: the
 * frontend proxies no login routes, so a form that reached one would forward a
 * real `client_secret` toward a path this BFF does not serve, through the Next
 * server process and whatever request logging sits there. Rejecting it here
 * keeps the credential in the browser.
 *
 * RUK-302 widens this together with the sign-in provider forms that need it.
 * Until then a `(login, *)` request is a 400, the same answer any unknown pair
 * gets.
 *
 * The `kind` segment therefore only ever holds one value. It exists because the
 * backend's path shape has it and because it gives this guard something cheap to
 * check — not because it is a variation point.
 */
export type IntegrationRouteParams = {
  kind: "notify";
  name: NotificationIntegrationName;
};

/** Resolve and whitelist the `[kind]/[name]` segments before touching the backend. */
export async function resolveIntegrationParams(
  params: Promise<{ kind: string; name: string }>,
): Promise<IntegrationRouteParams> {
  const { kind, name } = await params;
  if (kind !== "notify") {
    throw new BffValidationError([{ field: "kind", message: "Unknown integration category" }]);
  }
  if (!isNotifyIntegrationName(name)) {
    throw new BffValidationError([{ field: "name", message: "Unknown integration" }]);
  }
  return { kind, name };
}
