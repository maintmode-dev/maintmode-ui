/**
 * Notification channel domain model, shaped per swagger `apimodels.Channel`
 * (RUK-164 / backend RUK-141). A channel is one delivery target in the catalog
 * that maintenance `notify_targets` subscribe to.
 *
 * `transport` is a free-text key (slack / telegram / email / …) — the backend
 * catalog is open-ended, so the UI must tolerate transports it doesn't have a
 * dedicated pill for. `transport_channel_id` is the channel/chat id, NOT a
 * secret token (those live behind the integration settings, RUK-90).
 *
 * Archival is carried as `archived_at`: a date-time stamp when the channel was
 * soft-archived, absent/empty while active — there is no boolean flag and no
 * free-text status (contrast `Resource`, RUK-158).
 */
export interface NotifyChannel {
  id: string;
  name: string;
  description?: string;
  /** Open-string transport key, e.g. "slack" / "telegram" / "email". */
  transport: string;
  /** Channel/chat id within the transport (e.g. Slack `C0123…`). Not a secret. */
  transportChannelId: string;
  /** ISO-8601 archive stamp; absent/empty while the channel is active. */
  archivedAt?: string;
  createdAt: string;
  /** Empty until the channel is first edited (backend leaves `updated_at` null). */
  updatedAt: string;
  createdBy?: NotifyChannelActor;
  updatedBy?: NotifyChannelActor;
}

/** Authorship summary resolved from the auth service; may degrade to "Unknown user". */
export interface NotifyChannelActor {
  id?: string;
  email?: string;
  displayName?: string;
}

/**
 * True when a channel is archived. Archival is signalled by a present, non-empty
 * `archived_at`; the backend omits the field (or sends `""`) for active channels.
 */
export function isNotifyChannelArchived(channel: Pick<NotifyChannel, "archivedAt">): boolean {
  return typeof channel.archivedAt === "string" && channel.archivedAt.trim() !== "";
}
