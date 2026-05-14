import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/admin/roles/route";
import { auth } from "@/server/auth/auth-config";

describe("/api/admin/roles", () => {
  beforeEach(() => {
    process.env.MAINTMODE_API_BASE_URL = "https://backend.test";
    process.env.MAINTMODE_API_TIMEOUT_MS = "1000";
    delete process.env.MAINTMODE_ENABLE_MOCK_DATA;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns roles catalog for an admin session", async () => {
    setAuthSessionRoles(["admin"]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ roles: ["guest", "editor", "reviewer", "admin"] })),
    );

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ roles: ["guest", "editor", "reviewer", "admin"] });
  });

  it("returns FORBIDDEN for non-admin session before calling backend", async () => {
    setAuthSessionRoles(["editor"]);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.code).toBe("FORBIDDEN");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns AUTH_REQUIRED when no session", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const response = await GET();
    const data = await response.json();
    expect(response.status).toBe(401);
    expect(data.code).toBe("AUTH_REQUIRED");
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

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
