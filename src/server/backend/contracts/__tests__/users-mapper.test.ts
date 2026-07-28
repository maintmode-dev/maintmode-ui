import { describe, expect, it } from "vitest";

import { mapRoles, mapRolesList, mapUser, mapUsersPage } from "@/server/backend/contracts/users-mapper";
import type { AuthUserDto, ListUsersResponseDto } from "@/server/backend/contracts/users-dto";

describe("mapRoles", () => {
  it("keeps only valid domain roles", () => {
    expect(mapRoles(["guest", "editor", "reviewer", "admin"])).toEqual([
      "guest",
      "editor",
      "reviewer",
      "admin",
    ]);
  });

  it("drops unknown wire roles (e.g. legacy operator/viewer)", () => {
    expect(mapRoles(["operator", "viewer", "admin"])).toEqual(["admin"]);
  });

  it("returns [] for undefined", () => {
    expect(mapRoles(undefined)).toEqual([]);
  });
});

describe("mapUser", () => {
  it("maps the full auth User shape", () => {
    const dto: AuthUserDto = {
      id: "u-1",
      display_name: "Alice",
      email: "alice@example.com",
      oauth_provider: "google",
      roles: ["editor", "bogus"],
      connected_providers: ["google", "weird-provider"],
      created_at: "2026-01-01T00:00:00Z",
      last_seen_at: "2026-06-01T00:00:00Z",
      blocked_at: null,
      is_last_admin: false,
      telegram_tag: null,
      slack_tag: null,
    };
    expect(mapUser(dto)).toEqual({
      id: "u-1",
      email: "alice@example.com",
      display_name: "Alice",
      roles: ["editor"],
      oauth_provider: "google",
      connected_providers: ["google"],
      is_last_admin: false,
      created_at: "2026-01-01T00:00:00Z",
      last_seen_at: "2026-06-01T00:00:00Z",
      blocked_at: null,
      telegram_tag: null,
      slack_tag: null,
    });
  });

  it("carries a non-null blocked_at through (blocked account)", () => {
    const dto: AuthUserDto = { id: "u-2", blocked_at: "2026-05-01T00:00:00Z" };
    expect(mapUser(dto).blocked_at).toBe("2026-05-01T00:00:00Z");
  });

  it("normalizes empty-string blocked_at to null", () => {
    const dto: AuthUserDto = { id: "u-3", blocked_at: "" };
    expect(mapUser(dto).blocked_at).toBeNull();
  });

  it("falls back display_name to email then 'Unknown user'", () => {
    expect(mapUser({ id: "u-4", email: "x@y.z" }).display_name).toBe("x@y.z");
    expect(mapUser({ id: "u-5" }).display_name).toBe("Unknown user");
  });
});

describe("mapUser — messenger tags (SPEC §1.1)", () => {
  it("maps explicit nulls (the /me shape) to null", () => {
    const dto: AuthUserDto = { id: "u-6", telegram_tag: null, slack_tag: null };
    const user = mapUser(dto);
    expect(user.telegram_tag).toBeNull();
    expect(user.slack_tag).toBeNull();
  });

  it("maps absent keys (the /users/list omitempty shape) to null", () => {
    // The two wire forms must converge: the admin list drops the key entirely,
    // /me sends `null`. Both mean "not set" and must be indistinguishable here.
    const omitted = mapUser({ id: "u-7" });
    const explicitNull = mapUser({ id: "u-7", telegram_tag: null, slack_tag: null });
    expect(omitted.telegram_tag).toBeNull();
    expect(omitted.slack_tag).toBeNull();
    expect(omitted).toEqual(explicitNull);
  });

  it("passes values through verbatim, keeping a leading @", () => {
    const dto: AuthUserDto = { id: "u-8", telegram_tag: "@username", slack_tag: "@username.doe" };
    const user = mapUser(dto);
    expect(user.telegram_tag).toBe("@username");
    expect(user.slack_tag).toBe("@username.doe");
  });

  it("does not add a leading @ to a bare handle", () => {
    // `@username` and `username` are distinct stored values — never normalized.
    const user = mapUser({ id: "u-9", telegram_tag: "username", slack_tag: "username" });
    expect(user.telegram_tag).toBe("username");
    expect(user.slack_tag).toBe("username");
  });

  it("normalizes an empty-string tag to null", () => {
    const user = mapUser({ id: "u-10", telegram_tag: "", slack_tag: "" });
    expect(user.telegram_tag).toBeNull();
    expect(user.slack_tag).toBeNull();
  });
});

describe("mapUsersPage", () => {
  it("maps users and pagination fields", () => {
    const dto: ListUsersResponseDto = {
      users: [{ id: "u-1", roles: ["admin"] }],
      limit: 50,
      offset: 0,
      total: 1,
    };
    const page = mapUsersPage(dto);
    expect(page.users).toHaveLength(1);
    expect(page.users[0].roles).toEqual(["admin"]);
    expect(page).toMatchObject({ limit: 50, offset: 0, total: 1 });
  });

  it("defaults missing pagination from the user list", () => {
    const page = mapUsersPage({ users: [{ id: "u-1" }, { id: "u-2" }] });
    expect(page).toMatchObject({ limit: 2, offset: 0, total: 2 });
  });

  it("handles an empty response", () => {
    expect(mapUsersPage({})).toEqual({ users: [], limit: 0, offset: 0, total: 0 });
  });
});

describe("mapRolesList", () => {
  it("whitelists the wire role enum array", () => {
    expect(mapRolesList({ roles: ["guest", "operator", "admin"] })).toEqual(["guest", "admin"]);
  });

  it("returns [] for an empty response", () => {
    expect(mapRolesList({})).toEqual([]);
  });
});
