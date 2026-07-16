/**
 * Per-kind UI metadata for the integrations registry — labels, config-field
 * descriptors, and secret descriptors. Data, not branching: the sheet renders
 * whatever the active kind declares. Mirrors the backend kind registry
 * (`internal/services/integration/kinds/`) and the frozen decisions in
 * `maintmode-docs/design-snapshots/integrations-settings/README.md`.
 */

import type { IntegrationKind } from "@/domain/admin/integration";

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
  configFields: ConfigFieldMeta[];
  secrets: SecretMeta[];
}

export const INTEGRATION_KIND_META: Record<IntegrationKind, IntegrationKindMeta> = {
  slack: {
    label: "Slack",
    description: "Posts maintenance notifications to Slack channels via a bot.",
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
};
