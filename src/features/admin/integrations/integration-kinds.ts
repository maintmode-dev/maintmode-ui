/**
 * Per-system UI metadata for the integrations registry — labels, config-field
 * descriptors, and secret descriptors. Data, not branching: the sheet renders
 * whatever the active system declares. Mirrors the backend registry
 * (`internal/integrationkinds/`) and the frozen decisions of the
 * integrations-settings design snapshot.
 *
 * Keyed by SYSTEM (`slack`, `email`, `google`, …), never by category.
 * `kindMeta("notify")` resolves to null and a null renders no row at all — so
 * passing a category here fails silently, which is why callers pass `name`.
 */

import type { NotificationIntegrationName } from "@/domain/admin/integration";
import type { IntegrationBrand } from "@/shared/ui/icons/brand-icons";

import { LOGIN_KIND_META } from "./login-kinds";

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
  /**
   * The backend rejects `http://` here, so the form blocks it instead of
   * warning. Only meaningful alongside `url`.
   *
   * `validateUrlFields` warns on `http://` by default because local development
   * against `http://localhost` is legitimate for most fields. It is not
   * legitimate for a field carrying the backend's `HTTPSURL` rule (OIDC's
   * `issuer_url`): a warning there promises a save that will fail. The private
   * -range half of that rule is NOT duplicated here — the server words it well
   * and its shape is surprising (any numeric host is refused, public ones too).
   */
  httpsOnly?: true;
  /**
   * Owned by the deployment's preset catalog, not by the operator.
   *
   * Rendered read-only. NOT sent on create — the backend refuses a supplied
   * preset field. Echoed verbatim from the stored config on PATCH, because
   * `config` replaces wholesale and a DROPPED preset field is refused just like
   * a changed one. Which fields these are is per NAME, not per field: `google`
   * owns `issuer_url` + `display_name`, `custom` owns nothing.
   */
  preset?: true;
  /**
   * Where the value lives in the wire config, when it is not a top-level key.
   *
   * `jwtverifier.allowed_hosted_domains` is nested, so `name` alone cannot
   * address it. Only the two functions that cross the wire boundary read this —
   * `buildConfig` (write) and `buildDrafts` (read). The form's own draft state
   * stays FLAT and keyed by `name`; teaching the validators a path would make
   * them look up a nested key in a flat map and silently validate `undefined`.
   */
  path?: string[];
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
  /**
   * Config fields whose value this secret is cryptographically bound to.
   *
   * Editing one of them invalidates the stored secret, so the backend refuses
   * the update unless a replacement travels in the same request. The form
   * pushes the secret out of `locked` into `editing` rather than letting the
   * operator meet that 400 after typing everything else.
   *
   * Only fires when a secret is actually stored (`secrets_set[key]`): on a row
   * with nothing stored there is nothing to strand.
   */
  rebindsOn?: string[];
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
   * Which mark `IntegrationBrandIcon` renders. A data field rather than a
   * second hand-maintained union keyed by system — the previous shape drifted
   * out of sync with the system union the moment an entry was added.
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
 * Metadata for any system the UI renders, both halves in one record.
 *
 * This used to be a lazy registry: the sign-in descriptors registered
 * themselves at import time, so they existed only where the dev-gated section
 * did, and `kindMeta` fell back to that registration. The point was keeping
 * them out of production chunks while the section could not reach production.
 *
 * The section ships to production now, so its descriptors ship with it either
 * way and the indirection bought nothing — while still costing a real hazard:
 * the fallback returned `null` if the registering module had not been evaluated
 * yet, and `IntegrationRow` renders nothing on a `null` meta. That is a provider
 * quietly missing from the screen depending on module order, which is the same
 * shape as the incident this feature already had once.
 */
const KIND_META: Record<string, IntegrationKindMeta> = {
  ...NOTIFICATION_KIND_META,
  ...LOGIN_KIND_META,
};

export function kindMeta(name: string): IntegrationKindMeta | null {
  return KIND_META[name] ?? null;
}
