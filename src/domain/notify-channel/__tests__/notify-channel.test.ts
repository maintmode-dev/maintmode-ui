import { describe, expect, it } from "vitest";

import { isNotifyChannelArchived } from "@/domain/notify-channel/notify-channel";

describe("isNotifyChannelArchived", () => {
  it("is true when archived_at is a non-empty stamp", () => {
    expect(isNotifyChannelArchived({ archivedAt: "2026-03-01T00:00:00Z" })).toBe(true);
  });

  it("is false when archived_at is absent or empty", () => {
    expect(isNotifyChannelArchived({})).toBe(false);
    expect(isNotifyChannelArchived({ archivedAt: undefined })).toBe(false);
    expect(isNotifyChannelArchived({ archivedAt: "" })).toBe(false);
    expect(isNotifyChannelArchived({ archivedAt: "   " })).toBe(false);
  });
});
