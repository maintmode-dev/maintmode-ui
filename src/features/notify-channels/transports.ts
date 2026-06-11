import { Bell, Mail, Send } from "lucide-react";
import type { ComponentType } from "react";

import { SlackGlyph } from "@/shared/ui/icons/slack-glyph";

/**
 * UI descriptors for notification transports.
 *
 * The backend `GET /api/v1/notifications/transports` catalog carries only
 * `{ id, title }` (RUK-166 has not extended it with field copy yet), so the
 * channel-create form sources the `transport_channel_id` label / placeholder /
 * help text from this table, keyed by transport id. A transport the backend
 * reports but we have no descriptor for falls back to `UNKNOWN_TRANSPORT` —
 * the picker still works, the field just gets generic copy.
 */
export interface TransportDescriptor {
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
  icon: SlackGlyph,
  channelIdLabel: "Channel ID",
  channelIdPlaceholder: "C0123456789",
  channelIdHelp: "Find it in Slack: channel name → details → Channel ID (starts with C).",
  pillClassName:
    "text-[var(--transport-slack-fg)] bg-[var(--transport-slack-bg)] border-[var(--transport-slack-border)]",
};

const TELEGRAM: TransportDescriptor = {
  icon: Send,
  channelIdLabel: "Chat ID",
  channelIdPlaceholder: "-1001234567890",
  channelIdHelp: "Add the bot to the chat, then use @getidbot to read the numeric chat ID.",
  pillClassName:
    "text-[var(--transport-telegram-fg)] bg-[var(--transport-telegram-bg)] border-[var(--transport-telegram-border)]",
};

const EMAIL: TransportDescriptor = {
  icon: Mail,
  channelIdLabel: "Email address",
  channelIdPlaceholder: "ops-alerts@example.com",
  channelIdHelp: "The mailbox that receives maintenance notifications.",
  pillClassName:
    "text-[var(--transport-email-fg)] bg-[var(--transport-email-bg)] border-[var(--transport-email-border)]",
};

/** Generic fallback for a transport the backend reports but the UI doesn't model. */
export const UNKNOWN_TRANSPORT: TransportDescriptor = {
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
 * Hardcoded transport fallback used until the backend catalog loads (or if it
 * fails). Matches the transports the backend supports per RUK-141/RUK-144.
 */
export const FALLBACK_TRANSPORTS: { id: string; title: string }[] = [
  { id: "slack", title: "Slack" },
  { id: "telegram", title: "Telegram" },
  { id: "email", title: "Email" },
];
