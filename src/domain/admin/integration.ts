/**
 * Domain types for the integrations registry.
 *
 * Secrets are write-only — the read view carries `secrets_set`
 * (key → is-configured) and never a value.
 *
 * ## Two lists, one union, and a deliberately narrow predicate
 *
 * The registry now spans two categories: notification transports (Slack,
 * Telegram, email) and sign-in providers (OIDC, GitHub OAuth). They render as
 * separate sections, so each has its own list, and `IntegrationKind` is the
 * union of both.
 *
 * `isIntegrationKind` is NOT that union. It is the whitelist every BFF
 * integrations route gates on, and it stays narrow on purpose: the backend does
 * not know the auth kinds yet, so admitting one would let a real `client_secret`
 * be forwarded to a service with no route for it. Until the backend learns them
 * (RUK-294 reconciliation), the routes reject auth kinds with the same 400 they
 * give any unknown kind. `isAuthIntegrationKind` serves the UI, which needs to
 * name these kinds without making them routable.
 */

export const NOTIFICATION_INTEGRATION_KINDS = ["slack", "telegram", "email"] as const;
export const AUTH_INTEGRATION_KINDS = ["oidc", "github_oauth"] as const;
export const INTEGRATION_KINDS = [...NOTIFICATION_INTEGRATION_KINDS, ...AUTH_INTEGRATION_KINDS] as const;

export type NotificationIntegrationKind = (typeof NOTIFICATION_INTEGRATION_KINDS)[number];
export type AuthIntegrationKind = (typeof AUTH_INTEGRATION_KINDS)[number];
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

/**
 * The BFF route whitelist. Narrower than `IntegrationKind` by design — see the
 * module docblock. Widening this is a backend-gated change, not a cleanup.
 */
export function isIntegrationKind(value: string): value is NotificationIntegrationKind {
  return (NOTIFICATION_INTEGRATION_KINDS as readonly string[]).includes(value);
}

/** UI-side predicate: names the sign-in providers without making them routable. */
export function isAuthIntegrationKind(value: string): value is AuthIntegrationKind {
  return (AUTH_INTEGRATION_KINDS as readonly string[]).includes(value);
}

/**
 * Read-safe integration view. `config` is the non-secret settings verbatim;
 * `created_by`/`updated_by` are display names (same projection the
 * maintenance domain uses), absent when the backend has no author.
 */
export interface Integration {
  id: string;
  kind: IntegrationKind;
  enabled: boolean;
  config: Record<string, unknown>;
  secrets_set: Record<string, boolean>;
  created_at: string;
  created_by?: string;
  updated_at: string;
  updated_by?: string;
}

/** POST body — `enabled` is required (backend rejects an omitted flag). */
export interface CreateIntegrationInput {
  kind: IntegrationKind;
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
 */
export interface UpdateIntegrationInput {
  enabled?: boolean;
  config?: Record<string, unknown>;
  secrets?: Record<string, string | null>;
}

/**
 * POST body for the live probe — `POST /api/v1/integrations/email/test`.
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
