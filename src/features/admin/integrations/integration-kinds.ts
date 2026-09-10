/**
 * Per-kind UI metadata for the integrations registry — labels, config-field
 * descriptors, and secret descriptors. Data, not branching: the sheet renders
 * whatever the active kind declares. Mirrors the backend kind registry
 * (`internal/services/integration/kinds/`) and the frozen decisions of the
 * integrations-settings design snapshot.
 */

import type { IntegrationKind } from "@/domain/admin/integration";
import type { IntegrationBrand } from "@/shared/ui/icons/brand-icons";

/**
 * Sentinel option value for "leave this optional field unset". Radix Select
 * forbids an empty-string item value, so the metadata carries this sentinel and
 * `ConfigField` translates it to/from `""` at the render boundary — this is what
 * lets the operator return an optional Select to its default after picking a
 * value (otherwise the selection is a one-way trap).
 */
export const CONFIG_FIELD_UNSET = "__unset__";

export interface ConfigFieldOption {
  value: string;
  label: string;
  /** Marks a security-sensitive choice; the field renders an inline warning. */
  danger?: string;
}

export interface ConfigFieldMeta {
  name: string;
  label: string;
  optional: boolean;
  placeholder?: string;
  help?: string;
  /** Parsed as a number before sending (SMTP port). */
  numeric?: boolean;
  /** Renders as a select instead of a free-text input. */
  options?: ConfigFieldOption[];
  /**
   * A list of strings (OIDC `scopes`). Edited as one comma-or-space separated
   * text input — see `parseList`/`buildDrafts` in `dialog-form.ts`.
   */
  list?: true;
  /**
   * Format-validated as an absolute http(s) URL by `validateUrlFields`. These
   * become auth-dance parameters, so a malformed one is not cosmetic.
   */
  url?: true;
}

export interface SecretMeta {
  key: string;
  label: string;
  /** Required by server validation — the sheet blocks create without it. */
  required: boolean;
  /** Clear affordance only where the secret is optional (email password). */
  clearable: boolean;
  placeholder?: string;
  help?: string;
}

export interface IntegrationKindMeta {
  label: string;
  description: string;
  /**
   * Which mark `IntegrationBrandIcon` renders. A data field rather than a
   * second hand-maintained union keyed by kind — the previous shape drifted out
   * of sync with `IntegrationKind` the moment a kind was added.
   */
  brand: IntegrationBrand;
  configFields: ConfigFieldMeta[];
  secrets: SecretMeta[];
}

export const INTEGRATION_KIND_META: Record<IntegrationKind, IntegrationKindMeta> = {
  slack: {
    label: "Slack",
    description: "Posts maintenance notifications to Slack channels via a bot.",
    brand: "slack",
    configFields: [
      {
        name: "api_url",
        label: "API URL",
        optional: true,
        placeholder: "https://slack.com/api/",
        help: "Leave empty for the default Slack API endpoint.",
      },
      {
        name: "timeout",
        label: "Timeout",
        optional: true,
        placeholder: "10s",
        help: "Request timeout, Go duration format.",
      },
    ],
    secrets: [
      {
        key: "bot_token",
        label: "Bot token",
        required: true,
        clearable: false,
        placeholder: "xoxb-…",
        help: "OAuth token of your Slack app's bot user.",
      },
    ],
  },
  telegram: {
    label: "Telegram",
    description: "Sends maintenance notifications to Telegram chats via a bot.",
    brand: "telegram",
    configFields: [
      {
        name: "api_url",
        label: "API URL",
        optional: true,
        placeholder: "https://api.telegram.org",
        help: "Leave empty for the default Telegram Bot API endpoint.",
      },
      {
        name: "timeout",
        label: "Timeout",
        optional: true,
        placeholder: "10s",
        help: "Request timeout, Go duration format.",
      },
    ],
    secrets: [
      {
        key: "bot_token",
        label: "Bot token",
        required: true,
        clearable: false,
        placeholder: "123456:ABC-…",
        help: "Token from @BotFather.",
      },
    ],
  },
  email: {
    label: "Email",
    description: "Delivers maintenance notifications over SMTP.",
    brand: "email",
    configFields: [
      { name: "host", label: "SMTP host", optional: false, placeholder: "smtp.example.com" },
      { name: "port", label: "Port", optional: true, placeholder: "587", numeric: true },
      {
        name: "from",
        label: "From",
        optional: false,
        placeholder: "maintmode@example.com",
        help: "Sender address on outgoing mail.",
      },
      { name: "reply_to", label: "Reply-to", optional: true, placeholder: "noc@example.com" },
      {
        name: "username",
        label: "Username",
        optional: true,
        placeholder: "smtp-user",
        help: "Username and password must be set together.",
      },
      {
        name: "tls_policy",
        label: "TLS policy",
        optional: true,
        help: "Mandatory is the safe production posture. Default leaves it to the server.",
        options: [
          { value: CONFIG_FIELD_UNSET, label: "Default (server decides)" },
          { value: "mandatory", label: "Mandatory" },
          { value: "opportunistic", label: "Opportunistic" },
          {
            value: "none",
            label: "None (no encryption — not for production)",
            danger: "Mail will be sent unencrypted. Only use this for local testing.",
          },
        ],
      },
      {
        name: "timeout",
        label: "Timeout",
        optional: true,
        placeholder: "10s",
        help: "Request timeout, Go duration format.",
      },
    ],
    secrets: [
      {
        key: "password",
        label: "Password",
        required: false,
        clearable: true,
        placeholder: "••••••••",
        help: "SMTP password. Clear it to use an unauthenticated relay.",
      },
    ],
  },
  oidc: {
    label: "OpenID Connect",
    description: "Lets people sign in through a corporate identity provider.",
    brand: "oidc",
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
        placeholder: "https://idp.example.com/realms/corp",
        help: "Discovery base — the provider serves /.well-known/openid-configuration under it.",
      },
      { name: "client_id", label: "Client ID", optional: false },
      {
        name: "redirect_uri",
        label: "Redirect URI",
        optional: true,
        url: true,
        placeholder: "https://maintmode.example.com/auth/callback",
        help: "Leave empty to use this instance's default callback.",
      },
      {
        name: "scopes",
        label: "Scopes",
        optional: true,
        list: true,
        placeholder: "openid, profile, email",
        help: "Separate with commas or spaces. Clearing this hands the choice to the server.",
      },
    ],
    secrets: [
      {
        key: "client_secret",
        label: "Client secret",
        required: true,
        clearable: false,
        placeholder: "••••••••",
        help: "Issued by the provider when you registered this application.",
      },
    ],
  },
  github_oauth: {
    label: "GitHub",
    description: "Sign-in through GitHub. Configurable here, not yet active.",
    brand: "github",
    configFields: [
      {
        name: "display_name",
        label: "Display name",
        optional: true,
        placeholder: "GitHub",
        help: "Shown on the sign-in button. Defaults to GitHub.",
      },
      { name: "client_id", label: "Client ID", optional: false },
      {
        name: "scopes",
        label: "Scopes",
        optional: true,
        list: true,
        placeholder: "read:user, user:email",
        help: "Separate with commas or spaces. Clearing this hands the choice to the server.",
      },
    ],
    secrets: [
      {
        key: "client_secret",
        label: "Client secret",
        required: true,
        clearable: false,
        placeholder: "••••••••",
        help: "Issued by GitHub when you registered the OAuth app.",
      },
    ],
  },
};
