import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/admin/roles/assign/route";
import { auth } from "@/server/auth/auth-config";

describe("/api/admin/roles/assign", () => {
  beforeEach(() => {
    process.env.MAINTMODE_API_BASE_URL = "https://backend.test";
    process.env.MAINTMODE_API_TIMEOUT_MS = "1000";
    delete process.env.MAINTMODE_ENABLE_MOCK_DATA;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns 204 on successful assign", async () => {
    setAuthSessionRoles(["admin"]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));

    const response = await POST(
      jsonRequest({ user_id: "u-1", role: "editor" }),
    );

    expect(response.status).toBe(204);
  });

  it("rejects unsupported role with VALIDATION_ERROR", async () => {
    setAuthSessionRoles(["admin"]);
    const response = await POST(jsonRequest({ user_id: "u-1", role: "ceo" }));
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("returns FORBIDDEN for non-admin session", async () => {
    setAuthSessionRoles(["editor"]);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await POST(jsonRequest({ user_id: "u-1", role: "editor" }));
    const data = await response.json();
    expect(response.status).toBe(403);
    expect(data.code).toBe("FORBIDDEN");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

function setAuthSessionRoles(roles: string[]) {
  vi.mocked(auth).mockResolvedValueOnce({
    user: {
      id: "u1",
      email: "admin@example.com",
      displayName: "Admin",
      roles,
    },
    expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  } as never);
}

function jsonRequest(body: unknown) {
  return new Request("https://ui.test/api/admin/roles/assign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
