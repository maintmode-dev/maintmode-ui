/**
 * Per-system UI metadata for the integrations registry — labels, config-field
 * descriptors, and secret descriptors. Data, not branching: the sheet renders
 * whatever the active system declares. Mirrors the backend registry
 * (`internal/integrationkinds/`) and the frozen decisions of the
 * integrations-settings design snapshot.
 *
 * Keyed by SYSTEM (`slack`, `email`, …), never by category. `kindMeta("notify")`
 * resolves to null, and a null renders an empty row rather than throwing — so
 * passing a category here fails silently, which is why callers pass `name`.
 */

import type { NotificationIntegrationName } from "@/domain/admin/integration";
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
   * Status-switch copy for this kind, `[enabled, disabled]`. Data rather than a
   * branch in the dialog: the dialog is shared with the transports and ships to
   * every production browser, so a per-category `if` there would carry the
   * sign-in wording into production chunks (RUK-294's gate is verified by
   * grepping for exactly that).
   */
  statusHint: [enabled: string, disabled: string];
  /**
   * Shown above the Status block when this kind cannot be saved yet, and
   * disables Save. Present only while a kind is configurable but not routable.
   */
  unavailableNotice?: string;
  /**
   * Which mark `IntegrationBrandIcon` renders. A data field rather than a
   * second hand-maintained union keyed by kind — the previous shape drifted out
   * of sync with `IntegrationKind` the moment a kind was added.
   */
  brand: IntegrationBrand;
  configFields: ConfigFieldMeta[];
  secrets: SecretMeta[];
}

export const NOTIFICATION_KIND_META: Record<NotificationIntegrationName, IntegrationKindMeta> = {
  slack: {
    label: "Slack",
    statusHint: [
      "Channels using this transport will deliver notifications.",
      "Delivery through this transport is paused; settings are kept.",
    ],
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
    statusHint: [
      "Channels using this transport will deliver notifications.",
      "Delivery through this transport is paused; settings are kept.",
    ],
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
    statusHint: [
      "Channels using this transport will deliver notifications.",
      "Delivery through this transport is paused; settings are kept.",
    ],
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
};

/**
 * Metadata for any system the UI is currently rendering.
 *
 * Deliberately NOT one eager record over every known system: the row and the
 * dialog are shared by both sections and ship to every production browser, so a
 * single record would drag the sign-in provider descriptors into production
 * chunks along with them (RUK-294's gate is verified by grepping for exactly
 * that). Auth metadata is registered by the gated section at import time, so it
 * exists only where that section does.
 */
const registered: Partial<Record<string, IntegrationKindMeta>> = {};

export function registerKindMeta(entries: Record<string, IntegrationKindMeta>): void {
  Object.assign(registered, entries);
}

export function kindMeta(name: string): IntegrationKindMeta | null {
  return (NOTIFICATION_KIND_META as Record<string, IntegrationKindMeta>)[name] ?? registered[name] ?? null;
}
