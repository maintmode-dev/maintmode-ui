/**
 * Domain types for the notification-integrations registry.
 *
 * The registry is a closed list of three kinds; secrets are write-only — the
 * read view carries `secrets_set` (key → is-configured) and never a value.
 */

export const INTEGRATION_KINDS = ["slack", "telegram", "email"] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

export function isIntegrationKind(value: string): value is IntegrationKind {
  return (INTEGRATION_KINDS as readonly string[]).includes(value);
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
