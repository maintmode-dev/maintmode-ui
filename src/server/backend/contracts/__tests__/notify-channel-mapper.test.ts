import { describe, expect, it } from "vitest";

import { mapNotifyChannel, mapNotifyChannelList } from "@/server/backend/contracts/notify-channel-mapper";
import type { ChannelDto, ChannelsResponseDto } from "@/server/backend/contracts/maintmode-dto";

describe("mapNotifyChannel", () => {
  it("renames wire fields and carries authorship", () => {
    const dto: ChannelDto = {
      id: "c-1",
      name: "Ops alerts",
      description: "On-call channel",
      transport: "slack",
      transport_channel_id: "C0123456789",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-02-01T00:00:00Z",
      created_by: { id: "u-1", email: "a@b.c", display_name: "Ann" },
    };
    expect(mapNotifyChannel(dto)).toEqual({
      id: "c-1",
      name: "Ops alerts",
      description: "On-call channel",
      transport: "slack",
      transportChannelId: "C0123456789",
      archivedAt: undefined,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-02-01T00:00:00Z",
      createdBy: { id: "u-1", email: "a@b.c", displayName: "Ann" },
      updatedBy: undefined,
    });
  });

  it("defaults swagger-optional scalars and drops empty actors", () => {
    expect(mapNotifyChannel({ id: "c-2", created_by: {} })).toEqual({
      id: "c-2",
      name: "",
      description: undefined,
      transport: "",
      transportChannelId: "",
      archivedAt: undefined,
      createdAt: "",
      updatedAt: "",
      createdBy: undefined,
      updatedBy: undefined,
    });
  });

  it("carries a present archived_at through verbatim", () => {
    const result = mapNotifyChannel({ id: "c-3", archived_at: "2026-03-01T00:00:00Z" });
    expect(result.archivedAt).toBe("2026-03-01T00:00:00Z");
  });

  it("treats an empty archived_at as not archived", () => {
    expect(mapNotifyChannel({ id: "c-4", archived_at: "" }).archivedAt).toBeUndefined();
  });
});

describe("mapNotifyChannelList", () => {
  it("projects each channel in the envelope", () => {
    const dto: ChannelsResponseDto = {
      channels: [
        { id: "c-1", name: "a", transport: "slack" },
        { id: "c-2", name: "b", transport: "telegram" },
      ],
    };
    const result = mapNotifyChannelList(dto);
    expect(result).toHaveLength(2);
    expect(result[0].transport).toBe("slack");
    expect(result[1].name).toBe("b");
  });

  it("handles an empty/absent channels array", () => {
    expect(mapNotifyChannelList({})).toEqual([]);
  });
});
