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
