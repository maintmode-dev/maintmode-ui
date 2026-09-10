import type { AuthIntegrationKind } from "@/domain/admin/integration";

import { registerKindMeta, type IntegrationKindMeta } from "./integration-kinds";

/**
 * Sign-in provider metadata, kept in its own module so it is NOT in the
 * transports' import graph.
 *
 * `integration-row` and `integration-dialog` are shared by both sections and
 * ship to every production browser. Anything they reference statically travels
 * with them — so when these entries lived in the same record as Slack/SMTP, the
 * OIDC field descriptors and copy reached production chunks even though the
 * section itself was correctly gated out. The verification for RUK-294's gate
 * greps `.next/static/chunks/` for exactly that.
 *
 * Field names mirror the backend's file config (`internal/config/
 * oidc_provider.go`) and are an ASSUMPTION until the backend's `oidc` kind
 * lands — see SPEC §1.2.
 */
export const AUTH_KIND_META: Record<AuthIntegrationKind, IntegrationKindMeta> = {
  oidc: {
    label: "OpenID Connect",
    description: "Lets people sign in through a corporate identity provider.",
    brand: "oidc",
    statusHint: [
      "People can sign in through this provider.",
      "Sign-in through this provider is turned off; settings are kept.",
    ],
    unavailableNotice:
      "Backend support for sign-in providers has not shipped yet, so these settings can't be saved. The form is here to review, not to connect.",
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
    statusHint: [
      "People can sign in through this provider.",
      "Sign-in through this provider is turned off; settings are kept.",
    ],
    unavailableNotice:
      "Backend support for sign-in providers has not shipped yet, so these settings can't be saved. The form is here to review, not to connect.",
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

// Registered on import: this module is only in the graph where the gated
// sign-in providers section is, which is what keeps it out of production.
registerKindMeta(AUTH_KIND_META);
