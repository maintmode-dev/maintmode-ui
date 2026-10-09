import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST as logoutAll } from "@/app/api/auth/logout/all/route";
import { POST as logout } from "@/app/api/auth/logout/route";

vi.mock("@/server/auth/backend-token-exchange", () => ({
  revokeBackendSession: vi.fn(async () => undefined),
  revokeAllBackendSessions: vi.fn(async () => undefined),
}));
vi.mock("@/server/auth/session-token", () => ({
  readActiveSessionForSignOut: vi.fn(async () => ({ accessToken: "access-1", refreshToken: "refresh-1" })),
  clearActiveSession: vi.fn(async () => undefined),
}));
vi.mock("@/server/backend/security/csrf", () => ({
  isSameOriginRequest: () => true,
}));

// What standalone Next hands a route handler behind a proxy: the address the
// server listens on, not the one the browser used.
function post(path: string) {
  return new Request(`http://0.0.0.0:3000${path}`, { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe.each([
  ["/api/auth/logout", logout],
  ["/api/auth/logout/all", logoutAll],
])("%s redirects without the listen address", (path, POST) => {
  it("sends the browser to /login relative to the URL it used", async () => {
    const response = await POST(post(path));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login");
  });

  it("keeps a safe ?next= path, still relative", async () => {
    const response = await POST(post(`${path}?next=${encodeURIComponent("/calendar?view=week")}`));

    expect(response.headers.get("location")).toBe("/calendar?view=week");
  });

  // L-2 (security review 2026-10-07). A URL parser strips TAB, so
  // `/<TAB>/evil.example` resolves protocol-relative and leaves the site.
  it("falls back to /login for a ?next= hiding a control character", async () => {
    const response = await POST(post(`${path}?next=${encodeURIComponent("/\t/evil.example/x")}`));

    expect(response.headers.get("location")).toBe("/login");
  });

  it("falls back to /login for a ?next= that parses to a protocol-relative path", async () => {
    const response = await POST(post(`${path}?next=${encodeURIComponent("/..//evil.example/x")}`));

    expect(response.headers.get("location")).toBe("/login");
  });

  it("falls back to /login for an off-site ?next=", async () => {
    const response = await POST(post(`${path}?next=${encodeURIComponent("//evil.example/x")}`));

    expect(response.headers.get("location")).toBe("/login");
  });
});
