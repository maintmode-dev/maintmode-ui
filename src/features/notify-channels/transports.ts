import { Bell, Mail, Send } from "lucide-react";
import type { ComponentType } from "react";

import type { NotifyTransportStatus } from "@/domain/notify-channel/notify-channel";
import { SlackGlyph } from "@/shared/ui/icons/slack-glyph";

/**
 * UI descriptors for notification transports.
 *
 * The backend `GET /api/v1/notifications/transports` catalog carries
 * `{ id, title, transport_status }` but no field copy, so the
 * channel-create form sources the `transport_channel_id` label / placeholder /
 * help text from this table, keyed by transport id. A transport the backend
 * reports but we have no descriptor for falls back to `UNKNOWN_TRANSPORT` —
 * the picker still works, the field just gets generic copy.
 */
export interface TransportDescriptor {
  /** Display name used in warning copy, e.g. "Slack". */
  title: string;
  /** Icon shown in the pill and picker. */
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** Label for the `transport_channel_id` field, e.g. "Channel ID" / "Chat ID". */
  channelIdLabel: string;
  channelIdPlaceholder: string;
  channelIdHelp: string;
  /** Pill colour classes (token-driven; see globals.css transport tokens). */
  pillClassName: string;
}

const SLACK: TransportDescriptor = {
  title: "Slack",
  icon: SlackGlyph,
  channelIdLabel: "Channel ID",
  channelIdPlaceholder: "C0123456789",
  channelIdHelp: "Find it in Slack: channel name → details → Channel ID (starts with C).",
  pillClassName:
    "text-[var(--transport-slack-fg)] bg-[var(--transport-slack-bg)] border-[var(--transport-slack-border)]",
};

const TELEGRAM: TransportDescriptor = {
  title: "Telegram",
  icon: Send,
  channelIdLabel: "Chat ID",
  channelIdPlaceholder: "-1001234567890",
  channelIdHelp: "Add the bot to the chat, then use @getidbot to read the numeric chat ID.",
  pillClassName:
    "text-[var(--transport-telegram-fg)] bg-[var(--transport-telegram-bg)] border-[var(--transport-telegram-border)]",
};

const EMAIL: TransportDescriptor = {
  title: "Email",
  icon: Mail,
  channelIdLabel: "Email address",
  channelIdPlaceholder: "ops-alerts@example.com",
  channelIdHelp: "The mailbox that receives maintenance notifications.",
  pillClassName:
    "text-[var(--transport-email-fg)] bg-[var(--transport-email-bg)] border-[var(--transport-email-border)]",
};

/** Generic fallback for a transport the backend reports but the UI doesn't model. */
export const UNKNOWN_TRANSPORT: TransportDescriptor = {
  title: "",
  icon: Bell,
  channelIdLabel: "Channel ID",
  channelIdPlaceholder: "",
  channelIdHelp: "The destination id within the transport.",
  pillClassName: "text-fg-muted bg-bg-elev-3 border-border-subtle",
};

const TRANSPORTS: Record<string, TransportDescriptor> = {
  slack: SLACK,
  telegram: TELEGRAM,
  email: EMAIL,
};

/** Descriptor for a transport id, normalized to lowercase; falls back to generic. */
export function transportDescriptor(transport: string): TransportDescriptor {
  return TRANSPORTS[transport.trim().toLowerCase()] ?? UNKNOWN_TRANSPORT;
}

/**
 * Display name for warning copy: the descriptor title for modeled transports,
 * the raw id for unmodeled ones, and a generic noun when even the id is blank
 * (so the sentence never reads "The  integration…").
 */
export function transportDisplayTitle(transport: string): string {
  return transportDescriptor(transport).title || transport.trim() || "transport";
}

/**
 * Hardcoded transport fallback used until the backend catalog loads (or if it
 * fails). Matches the transports the backend supports.
 * Carries NO `transportStatus`: absence of catalog data means "no signal", so
 * the picker doesn't decorate options with warnings it can't substantiate.
 */
export const FALLBACK_TRANSPORTS: { id: string; title: string }[] = [
  { id: "slack", title: "Slack" },
  { id: "telegram", title: "Telegram" },
  { id: "email", title: "Email" },
];

/**
 * Warning copy per transport status. `ok` maps to `null` — a
 * healthy integration renders zero chrome. Every other known status gets bespoke,
 * actionable copy; any *future* unknown status still falls through to the generic
 * fail-visible `default` rather than being swallowed as healthy. Wording pending
 * design review (see SPEC.md).
 */
export interface TransportStatusCopy {
  /** Short badge/row label, e.g. "Integration disabled". */
  badge: string;
  /** Full sentence for the detail-page alert / create-form warning. `<transport>` is the title. */
  detail: (transportTitle: string) => string;
}

export function transportStatusCopy(status: NotifyTransportStatus): TransportStatusCopy | null {
  switch (status) {
    case "ok":
      return null;
    case "unreadable":
      // The integration is enabled and looks configured, but its secret can't be
      // decrypted on the delivery path (rolled-back KEK, corrupt/rotated key,
      // missing DEK) — dispatch fails. The sneakiest state: the admin's toggles
      // all read healthy, so the copy must point at the credential, not the toggle
      // (never "disabled"/"not configured", which send them to the wrong fix).
      return {
        badge: "Integration unreadable",
        detail: (t) =>
          `The ${t} integration is enabled but its credentials can't be read (a broken or rotated encryption key). Notifications will fail to send. Re-check the integration secret in Settings → Integrations.`,
      };
    case "disabled":
      return {
        badge: "Integration disabled",
        detail: (t) =>
          `The ${t} integration is disabled. Notifications to this channel are silently dropped. Enable the integration in Settings → Integrations.`,
      };
    case "not_configured":
      return {
        badge: "Integration not configured",
        detail: (t) =>
          `No ${t} integration is configured. Notifications to this channel will not be delivered. Configure the integration in Settings → Integrations.`,
      };
    default:
      return {
        badge: "Integration unavailable",
        detail: (t) =>
          `The ${t} integration is not operational (status: ${status}). Notifications may not be delivered.`,
      };
  }
}
