/**
 * Backend → domain mappers for the notification-channel read paths (RUK-164).
 * Pure, server-only: the BFF routes call these so the browser only ever sees
 * the domain `NotifyChannel`, never the wire shapes in `./maintmode-dto.ts`
 * (D-2: all BE↔UI mapping lives in `src/server/backend/**`).
 *
 * `apimodels.Channel` is close to the domain shape; this layer renames the
 * snake_case wire fields to the domain's camelCase and fills swagger-optional
 * scalars with safe defaults so the UI never guards against a missing
 * `name`/`transport`/timestamp.
 */

import type {
  NotifyChannel,
  NotifyChannelActor,
  NotifyTransportStatus,
} from "@/domain/notify-channel/notify-channel";
import { normalizeTransportStatus } from "@/domain/notify-channel/notify-channel";

import type { ChannelDto, ChannelsResponseDto, TransportsResponseDto, UserSummaryDto } from "./maintmode-dto";

/** `uimodels.UserSummary` → domain actor, dropping the summary entirely when empty. */
function mapActor(dto: UserSummaryDto | undefined): NotifyChannelActor | undefined {
  if (!dto) return undefined;
  if (dto.id == null && dto.email == null && dto.display_name == null) return undefined;
  return {
    id: dto.id,
    email: dto.email,
    displayName: dto.display_name,
  };
}

/** `apimodels.Channel` → domain `NotifyChannel`, defaulting swagger-optional scalars. */
export function mapNotifyChannel(dto: ChannelDto): NotifyChannel {
  return {
    id: dto.id,
    name: dto.name ?? "",
    description: dto.description,
    transport: dto.transport ?? "",
    // Fail-visible default: a missing status reads "not_configured", never "ok"
    // (RUK-199); unknown values pass through so the UI can warn about them.
    transportStatus: normalizeTransportStatus(dto.transport_status),
    transportChannelId: dto.transport_channel_id ?? "",
    // Carried through verbatim: a present, non-empty value marks the channel
    // archived (see `isNotifyChannelArchived`); omit the key when absent so the
    // domain object doesn't assert an archival the backend never sent.
    archivedAt: dto.archived_at ? dto.archived_at : undefined,
    createdAt: dto.created_at ?? "",
    updatedAt: dto.updated_at ?? "",
    createdBy: mapActor(dto.created_by),
    updatedBy: mapActor(dto.updated_by),
  };
}

/**
 * `GET /api/v1/notifications/channels` → domain list. The envelope is a plain
 * `{ channels }` with no pagination window (unlike resources), so the mapper
 * just projects each item; the backend already sorts newest-first.
 */
export function mapNotifyChannelList(dto: ChannelsResponseDto): NotifyChannel[] {
  return (dto.channels ?? []).map(mapNotifyChannel);
}

/** One transport option from the catalog, in domain (camelCase) shape. */
export interface NotifyTransport {
  id: string;
  title: string;
  transportStatus: NotifyTransportStatus;
}

/**
 * `GET /api/v1/notifications/transports` → domain list (RUK-199). Entries
 * without an id are dropped; `title` falls back to the id; `transport_status`
 * is normalized with the fail-visible default. Keeps the wire shape out of the
 * client (D-2) now that the catalog carries semantics, not just labels.
 */
export function mapTransports(dto: TransportsResponseDto): NotifyTransport[] {
  return (dto.transports ?? [])
    .filter((t): t is typeof t & { id: string } => typeof t.id === "string" && t.id.length > 0)
    .map((t) => ({
      id: t.id,
      title: t.title || t.id,
      transportStatus: normalizeTransportStatus(t.transport_status),
    }));
}
