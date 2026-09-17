/**
 * Domain types for the integrations registry.
 *
 * Secrets are write-only — the read view carries `secrets_set`
 * (key → is-configured) and never a value.
 *
 * ## A row is a PAIR, not a kind (RUK-304, backend `b74a4536`)
 *
 * `kind` used to be the system: `slack | telegram | email`. It is now the
 * CATEGORY the row belongs to — `notify` for a delivery transport, `login` for
 * a sign-in provider — and the system moved to `name`. The two together are the
 * row's identity AND the path that addresses it: clients build
 * `/api/v1/integrations/{kind}/{name}` from these two fields.
 *
 * The backend's registry currently holds six systems: `slack`, `telegram` and
 * `email` under `notify`; `google`, `custom` and `github` under `login`. Only
 * the notify half is a closed set here, and deliberately so — the login half
 * grew by one (`github`) between RUK-304 being written and being started, so a
 * constant listing it would be a stale list that looks authoritative. RUK-302
 * owns the login side and can encode it once it renders it.
 *
 * ## The whitelist now admits both halves (RUK-302)
 *
 * `isRoutableIntegrationPair` is what every BFF integrations route gates on,
 * and it admits the five pairs the backend's registry serves: three transports
 * under `notify`, two sign-in providers under `login`.
 *
 * It used to admit transports only, because this frontend had no login routes
 * and forwarding a real `client_secret` toward a path the BFF does not proxy
 * would have been worse than refusing it. The forms that need those routes now
 * exist, so the narrow gate would only break them.
 *
 * What did NOT change: the gate is still a closed list, and it is still checked
 * before the backend is touched. A pair outside it is a 400 here, not a round
 * trip that discovers the same answer more slowly.
 */

/** The category half of the pair — which half of the product a row serves. */
export const INTEGRATION_CATEGORIES = ["notify", "login"] as const;
export type IntegrationCategory = (typeof INTEGRATION_CATEGORIES)[number];

/** The system half, for the transports this UI renders. */
export const NOTIFICATION_INTEGRATION_NAMES = ["slack", "telegram", "email"] as const;
export type NotificationIntegrationName = (typeof NOTIFICATION_INTEGRATION_NAMES)[number];

/**
 * The system half for the sign-in providers this UI renders.
 *
 * These ARE names in the backend's vocabulary, unlike the `oidc`/`github_oauth`
 * placeholders they replace, which named nothing. The backend's registry admits
 * `(login, google)` and `(login, custom)`; both are OIDC, differing only in
 * which fields the deployment preset owns.
 *
 * `github` is deliberately absent, and the reason has changed since this was
 * written. It was absent because the backend did not serve it; the backend
 * merged it (`7a6565d`) while this work was in review, so it is now a pair the
 * registry admits and this frontend simply has no descriptor for.
 *
 * That fails CLOSED — an omitted name is refused by `isRoutableIntegrationPair`
 * and the provider is invisible, rather than reachable and half-configured. It
 * is a gap to fill, not a hazard to rush: its field set is a different struct
 * (no issuer, no scopes, four preset-owned URLs), so it is a descriptor plus
 * one entry here, which is why this is a named constant rather than an inline
 * list.
 */
export const LOGIN_INTEGRATION_NAMES = ["google", "custom"] as const;
export type LoginIntegrationName = (typeof LOGIN_INTEGRATION_NAMES)[number];

/**
 * Reported for login rows only, and `omitempty` on the wire — absence means
 * "not applicable", never "ok". `unresolved` is the load-bearing one: the row
 * exists and is listed, but sign-in through it will refuse.
 */
export const INTEGRATION_HEALTH_VALUES = ["ok", "unresolved", "disabled", "unreadable"] as const;
export type IntegrationHealth = (typeof INTEGRATION_HEALTH_VALUES)[number];

/** Whether a wire `name` is a transport this UI renders. */
export function isNotifyIntegrationName(value: string): value is NotificationIntegrationName {
  return (NOTIFICATION_INTEGRATION_NAMES as readonly string[]).includes(value);
}

/** Whether a wire `name` is a sign-in provider this UI renders. */
export function isLoginIntegrationName(value: string): value is LoginIntegrationName {
  return (LOGIN_INTEGRATION_NAMES as readonly string[]).includes(value);
}

/**
 * THE routability gate — one predicate, four callers.
 *
 * Answers exactly one question: may a request for this pair leave this
 * frontend. It is the whitelist every integrations BFF route checks, the
 * condition the create route checks on its body, and the condition the dialog
 * checks before putting a typed `client_secret` on the wire.
 *
 * ## Why one function and not four conditions
 *
 * There used to be four, and they had already drifted: the item routes called a
 * shared resolver, the create route hand-rolled `body.kind !== "notify"`, and
 * the dialog tested the name alone — so "may this be sent" had three different
 * answers depending on which door you came through. A security control with
 * copies is a control that disagrees with itself eventually; this is the one
 * place to change when the backend's registry changes.
 *
 * ## Why the category matters
 *
 * A name alone stopped being an answer once one screen held both halves of the
 * registry. `slack` is routable under `notify` and not under `login`, and the
 * backend refuses the mismatched pair too — the pair is the identity, so the
 * pair is what gets checked.
 */
export function isRoutableIntegrationPair(kind: string, name: string): boolean {
  if (kind === "notify") return isNotifyIntegrationName(name);
  if (kind === "login") return isLoginIntegrationName(name);
  return false;
}

/** Whether a wire `kind` is a category this frontend knows how to place. */
export function isIntegrationCategory(value: string): value is IntegrationCategory {
  return (INTEGRATION_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Narrows a wire `health` to the closed enum. A value this frontend does not
 * recognise is NOT coerced to something renderable — the mapper drops it to
 * `undefined` and logs, so an unknown state can never be presented as a working
 * one.
 */
export function isIntegrationHealth(value: string): value is IntegrationHealth {
  return (INTEGRATION_HEALTH_VALUES as readonly string[]).includes(value);
}

/**
 * Read-safe integration view. `config` is the non-secret settings verbatim;
 * `created_by`/`updated_by` are display names (same projection the
 * maintenance domain uses), absent when the backend has no author.
 *
 * `health` is optional because the backend omits it for notify rows. Do not
 * default it — `?? "ok"` would report an inapplicable field as a healthy one.
 */
export interface Integration {
  id: string;
  kind: IntegrationCategory;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
  secrets_set: Record<string, boolean>;
  health?: IntegrationHealth;
  created_at: string;
  created_by?: string;
  updated_at: string;
  updated_by?: string;
}

/**
 * POST body — `enabled` is required (backend rejects an omitted flag), and
 * `name` is required alongside `kind`. Both halves of the pair travel: the
 * backend reads `kind` as the category, so sending the system name in it (the
 * pre-`b74a4536` shape) is rejected.
 */
export interface CreateIntegrationInput {
  kind: IntegrationCategory;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
  /** Plaintext secret values; the backend encrypts before persisting. */
  secrets: Record<string, string>;
}

/**
 * PATCH body — uniform PATCH semantics on the backend: every omitted field
 * keeps its stored value. `config` is an explicit object that replaces the
 * stored config wholesale (the form always submits the full config). Each
 * secret key carries an intent: key absent → keep the stored value;
 * non-empty string → replace; null → clear.
 *
 * Carries no identifier: the row is addressed by the path, so callers pass the
 * pair alongside this body rather than inside it.
 */
export interface UpdateIntegrationInput {
  enabled?: boolean;
  config?: Record<string, unknown>;
  secrets?: Record<string, string | null>;
}

/**
 * POST body for the live probe — `POST /api/v1/integrations/notify/email/test`.
 *
 * `secrets` is a FLAT map here, not the three-state intent map
 * `UpdateIntegrationInput` uses. There is no stored row to merge with: a key
 * present means "use this value", a key absent means "there is no such secret".
 * The backend deliberately never substitutes a stored password — pairing one
 * with a caller-named host would hand the credential to whatever server the
 * request pointed at.
 *
 * `to` is required. The backend does not infer a recipient from the caller's
 * token: mailing an address nobody named is a side effect nobody asked for.
 */
export interface TestIntegrationInput {
  config: Record<string, unknown>;
  secrets: Record<string, string>;
  to: string;
}
