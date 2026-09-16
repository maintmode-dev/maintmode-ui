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
 * ## The whitelist is narrower than the backend, on purpose
 *
 * `isNotifyIntegrationName` is what every BFF integrations route gates on, and
 * it admits transports only. The backend serves login rows too, but this
 * frontend has no route for them: admitting one would let a real
 * `client_secret` be forwarded toward a path this BFF does not proxy. Widening
 * it is a RUK-302 change that ships together with the forms that need it, not a
 * cleanup.
 *
 * `AUTH_INTEGRATION_KINDS` keeps its values (`oidc`, `github_oauth`) even
 * though they name nothing in the new vocabulary. They are referenced only from
 * the dev-gated sign-in providers section, which cannot reach production, and
 * RUK-302 rewrites them alongside that section's field descriptors.
 */

/** The category half of the pair — which half of the product a row serves. */
export const INTEGRATION_CATEGORIES = ["notify", "login"] as const;
export type IntegrationCategory = (typeof INTEGRATION_CATEGORIES)[number];

/** The system half, for the transports this UI renders. */
export const NOTIFICATION_INTEGRATION_NAMES = ["slack", "telegram", "email"] as const;
export type NotificationIntegrationName = (typeof NOTIFICATION_INTEGRATION_NAMES)[number];

/**
 * Dev-gated sign-in provider identifiers. NOT names in the backend's
 * vocabulary — see the module docblock. Frozen for RUK-302.
 */
export const AUTH_INTEGRATION_KINDS = ["oidc", "github_oauth"] as const;
export type AuthIntegrationKind = (typeof AUTH_INTEGRATION_KINDS)[number];

/**
 * Reported for login rows only, and `omitempty` on the wire — absence means
 * "not applicable", never "ok". `unresolved` is the load-bearing one: the row
 * exists and is listed, but sign-in through it will refuse.
 */
export const INTEGRATION_HEALTH_VALUES = ["ok", "unresolved", "disabled", "unreadable"] as const;
export type IntegrationHealth = (typeof INTEGRATION_HEALTH_VALUES)[number];

/**
 * The BFF route whitelist. Narrower than the backend's registry by design —
 * see the module docblock. Widening this is a backend-gated change, not a
 * cleanup.
 */
export function isNotifyIntegrationName(value: string): value is NotificationIntegrationName {
  return (NOTIFICATION_INTEGRATION_NAMES as readonly string[]).includes(value);
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
