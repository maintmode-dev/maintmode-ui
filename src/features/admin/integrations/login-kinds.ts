import type { LoginIntegrationName } from "@/domain/admin/integration";

import type { ConfigFieldMeta, IntegrationKindMeta, SecretMeta } from "./integration-kinds";

/**
 * Sign-in provider metadata, keyed by the backend's own registry names.
 *
 * Replaces `auth-kinds.ts`, whose entries were keyed `oidc` and `github_oauth`
 * — identifiers that named nothing in the registry. Both providers here are
 * OIDC; what separates them is which fields the deployment's preset catalog
 * owns, not which protocol they speak.
 *
 * Field shapes are taken from `internal/integrationkinds/oidc.go` on the
 * backend's `main`, not from its file-config struct and not from the ticket.
 * Three of them contradict what the previous descriptors assumed:
 *
 *  - `redirect_uri` is REQUIRED (it was optional here, with help text offering
 *    a default callback that does not exist);
 *  - `issuer_url` must be https and must not point anywhere internal, so the
 *    form blocks `http://` instead of warning;
 *  - `allowed_hosted_domains` is nested under `jwtverifier`.
 *
 * `github` is absent: it is a real registry entry only on an unmerged backend
 * branch. See `LOGIN_INTEGRATION_NAMES`.
 *
 * ## The preset flags mirror a backend deployment file
 *
 * Which fields carry `preset: true` is not something the API reports — it comes
 * from the backend's own catalogue — `app.config.yaml` under `login.presets`,
 * one per deployment — verified identical across all four environments. So
 * this is a registry the frontend mirrors rather than reads, and it goes stale
 * the way every mirrored registry does: silently, and only on the environment
 * whose catalogue changed.
 *
 * What makes that survivable is that BOTH directions fail loudly at the
 * backend rather than corrupting anything — supplying a preset field is a 400,
 * and dropping one is a 400. A drift here costs an operator a failed save with
 * a server message that names the field, not a wrong provider configuration.
 */

/** Shared by both providers — same struct, same wire validation. */
const CLIENT_SECRET = {
  key: "client_secret",
  label: "Client secret",
  required: true,
  clearable: false,
  placeholder: "••••••••",
  help: "Issued by the provider when you registered this application.",
} satisfies SecretMeta;

const HOSTED_DOMAINS = {
  name: "allowed_hosted_domains",
  path: ["jwtverifier", "allowed_hosted_domains"],
  label: "Allowed hosted domains",
  optional: true,
  list: true,
  placeholder: "corp.example, eu.corp.example",
  help: "Separate with commas or spaces.",
} satisfies ConfigFieldMeta;

const REDIRECT_URI = {
  name: "redirect_uri",
  label: "Redirect URI",
  // Required by the backend, which refuses a half-configured provider at the
  // edge rather than at someone's first sign-in attempt.
  optional: false,
  url: true,
  placeholder: "https://maintmode.example.com/auth/callback",
  help: "Must match the callback registered with the provider.",
} satisfies ConfigFieldMeta;

const SCOPES = {
  name: "scopes",
  label: "Scopes",
  optional: true,
  list: true,
  placeholder: "openid, profile, email",
  help: "Separate with commas or spaces. Leave empty to use the provider defaults.",
} satisfies ConfigFieldMeta;

const STATUS_HINT: [string, string] = [
  "People can sign in through this provider.",
  "Sign-in through this provider is turned off; settings are kept.",
];

export const LOGIN_KIND_META: Record<LoginIntegrationName, IntegrationKindMeta> = {
  google: {
    label: "Google",
    description: "Lets people sign in with a Google account.",
    brand: "oidc",
    statusHint: STATUS_HINT,
    configFields: [
      {
        name: "display_name",
        label: "Display name",
        optional: false,
        preset: true,
        help: "Set by this deployment.",
      },
      {
        name: "issuer_url",
        label: "Issuer URL",
        optional: false,
        url: true,
        httpsOnly: true,
        preset: true,
        help: "Set by this deployment.",
      },
      { name: "client_id", label: "Client ID", optional: false },
      REDIRECT_URI,
      SCOPES,
      {
        ...HOSTED_DOMAINS,
        // The warning this field carries is provider-specific and computed from
        // the issuer, not stored — see `hostedDomainNotice`.
        help: "Separate with commas or spaces. Leave empty to allow any Google account.",
      },
    ],
    secrets: [
      {
        ...CLIENT_SECRET,
        // Binds to `issuer_url` and `client_id` on the backend, but google's
        // issuer is preset-owned and never editable — declaring it would name a
        // field the operator cannot touch.
        rebindsOn: ["client_id"],
      },
    ],
  },
  custom: {
    label: "Custom OIDC",
    description: "Lets people sign in through a corporate identity provider.",
    brand: "oidc",
    statusHint: STATUS_HINT,
    configFields: [
      {
        name: "display_name",
        label: "Display name",
        optional: false,
        placeholder: "Corporate SSO",
        help: "Shown on the sign-in button.",
      },
      {
        name: "issuer_url",
        label: "Issuer URL",
        optional: false,
        url: true,
        httpsOnly: true,
        placeholder: "https://idp.example.com/realms/corp",
        help: "Discovery base — the provider serves /.well-known/openid-configuration under it.",
      },
      { name: "client_id", label: "Client ID", optional: false },
      REDIRECT_URI,
      SCOPES,
      HOSTED_DOMAINS,
    ],
    secrets: [
      {
        ...CLIENT_SECRET,
        // Both fields are operator-editable here, and both are part of the
        // secret's cryptographic binding on the backend.
        rebindsOn: ["issuer_url", "client_id"],
      },
    ],
  },
};
