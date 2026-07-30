import { describe, expect, it } from "vitest";

import type { AssignableUser, MaintenanceMention } from "../maintenance";
import { MAX_MENTIONS, mergeMentionChips } from "../mentions";

function user(id: string, display_name: string, has_messenger_tag?: boolean): AssignableUser {
  return {
    id,
    display_name,
    email: `${id}@example.com`,
    roles: ["operator"],
    ...(has_messenger_tag === undefined ? {} : { has_messenger_tag }),
  };
}

function mention(user_id: string, display_name: string): MaintenanceMention {
  return { user_id, display_name };
}

describe("MAX_MENTIONS", () => {
  it("matches the backend's maint.MaxMentions", () => {
    expect(MAX_MENTIONS).toBe(10);
  });
});

describe("mergeMentionChips", () => {
  it("takes the name and the tag flag from the picker options", () => {
    const options = [user("u1", "Alice", true), user("u2", "Bob", false)];

    expect(mergeMentionChips(["u1", "u2"], options, undefined)).toEqual([
      { id: "u1", name: "Alice", hasTag: true },
      { id: "u2", name: "Bob", hasTag: false },
    ]);
  });

  it("prefers the options over detail when both know the user", () => {
    const chips = mergeMentionChips(["u1"], [user("u1", "Alice Renamed", true)], [mention("u1", "Alice")]);

    expect(chips).toEqual([{ id: "u1", name: "Alice Renamed", hasTag: true }]);
  });

  // AC-16: the blocked / beyond-the-limit case. The chip must survive, and it must
  // not claim to know whether the person has a messenger handle.
  it("falls back to detail.mentions when the id is missing from the options", () => {
    const chips = mergeMentionChips(["u9"], [user("u1", "Alice", true)], [mention("u9", "Carol")]);

    expect(chips).toHaveLength(1);
    expect(chips[0].id).toBe("u9");
    expect(chips[0].name).toBe("Carol");
    expect(chips[0].hasTag).toBeUndefined();
    expect(chips[0].hasTag).not.toBe(false);
  });

  it("keeps the detail name even when the backend could not resolve the person", () => {
    const chips = mergeMentionChips(["gone"], [], [mention("gone", "Unknown user")]);

    expect(chips).toEqual([{ id: "gone", name: "Unknown user", hasTag: undefined }]);
  });

  it("degrades to the raw id when no source knows the user", () => {
    const chips = mergeMentionChips(["u9"], [user("u1", "Alice", true)], [mention("u8", "Carol")]);

    expect(chips).toHaveLength(1);
    expect(chips[0].name).toBe("u9");
    expect(chips[0].hasTag).toBeUndefined();
  });

  it("follows the order of ids, not the order of the options", () => {
    const options = [user("u1", "Alice"), user("u2", "Bob"), user("u3", "Dave")];

    expect(mergeMentionChips(["u3", "u1", "u2"], options, undefined).map((c) => c.name)).toEqual([
      "Dave",
      "Alice",
      "Bob",
    ]);
  });

  it("keeps an unresolvable id in place rather than sorting it to the end", () => {
    const chips = mergeMentionChips(["u1", "u9", "u2"], [user("u1", "Alice"), user("u2", "Bob")], undefined);

    expect(chips.map((c) => c.id)).toEqual(["u1", "u9", "u2"]);
  });

  it("survives empty options and absent detail", () => {
    expect(mergeMentionChips(["u1", "u2"], [], undefined)).toEqual([
      { id: "u1", name: "u1", hasTag: undefined },
      { id: "u2", name: "u2", hasTag: undefined },
    ]);
  });

  it("returns nothing for an empty selection", () => {
    expect(mergeMentionChips([], [user("u1", "Alice", true)], [mention("u1", "Alice")])).toEqual([]);
  });

  it("leaves hasTag undefined when the option itself carries no flag (old backend)", () => {
    const chips = mergeMentionChips(["u1"], [user("u1", "Alice")], undefined);

    expect(chips[0].hasTag).toBeUndefined();
  });
});
