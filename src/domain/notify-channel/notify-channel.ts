/**
 * Notification channel domain model, shaped per swagger `apimodels.Channel`.
 * A channel is one delivery target in the catalog that maintenance
 * `notify_targets` subscribe to.
 *
 * `transport` is a free-text key (slack / telegram / email / …) — the backend
 * catalog is open-ended, so the UI must tolerate transports it doesn't have a
 * dedicated pill for. `transport_channel_id` is the channel/chat id, NOT a
 * secret token (those live behind the integration settings).
 *
 * Archival is carried as `archived_at`: a date-time stamp when the channel was
 * soft-archived, absent/empty while active — there is no boolean flag and no
 * free-text status (contrast `Resource`).
 */
export interface NotifyChannel {
  id: string;
  name: string;
  description?: string;
  /** Open-string transport key, e.g. "slack" / "telegram" / "email". */
  transport: string;
  /** Delivery health of the channel's transport integration. */
  transportStatus: NotifyTransportStatus;
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

/**
 * Delivery health of a transport integration (backend `transport_status`).
 * Deliberately an OPEN string union: the enum may still grow, and the UI must
 * render any value it doesn't know as a warning — fail-visible — rather than
 * swallow it as healthy.
 *
 * - `ok` — an enabled integration exists and its secret resolves; will deliver.
 * - `unreadable` — an enabled integration exists but its secret can't be
 *   decrypted on the delivery path (rolled-back KEK, corrupt/rotated key,
 *   missing DEK); dispatch fails. Looks configured but isn't.
 * - `disabled` — the integration exists but is switched off; notifications
 *   are silently dropped.
 * - `not_configured` — no integration exists for the transport at all.
 */
export type NotifyTransportStatus =
  | "ok"
  | "unreadable"
  | "disabled"
  | "not_configured"
  | (string & {});

/**
 * Wire `transport_status` → domain. A missing/blank value defaults to
 * `not_configured` (fail-visible — never assume "ok"); any other value passes
 * through so unknown future statuses surface as warnings. Capped at 64 chars —
 * the raw value is quoted in user-visible warning copy, and an unbounded
 * backend string must not reach the DOM verbatim.
 */
export function normalizeTransportStatus(raw: string | undefined | null): NotifyTransportStatus {
  const value = raw?.trim().slice(0, 64);
  return value ? value : "not_configured";
}
