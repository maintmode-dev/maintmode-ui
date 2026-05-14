import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/audit/route";
import { auth } from "@/server/auth/auth-config";

describe("/api/audit", () => {
  beforeEach(() => {
    process.env.MAINTMODE_API_BASE_URL = "https://backend.test";
    process.env.MAINTMODE_API_TIMEOUT_MS = "1000";
    delete process.env.MAINTMODE_ENABLE_MOCK_DATA;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns normalized audit log entries", async () => {
    setAuthSessionRoles(["admin"]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          logs: [
            {
              id: "a1",
              action: "assigned",
              actor: "admin@example.com",
              entity_type: "role",
              entity_id: "admin",
              target_type: "user",
              target_id: "u-2",
              details: "granted",
              created_at: "2026-05-10T10:00:00Z",
            },
          ],
        }),
      ),
    );

    const response = await GET(new Request("https://ui.test/api/audit?limit=10"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.logs).toEqual([
      {
        id: "a1",
        action: "assigned",
        actor: "admin@example.com",
        entityType: "role",
        entityId: "admin",
        targetType: "user",
        targetId: "u-2",
        details: "granted",
        createdAt: "2026-05-10T10:00:00Z",
      },
    ]);
  });

  it("rejects limit above 100 with VALIDATION_ERROR", async () => {
    setAuthSessionRoles(["admin"]);
    const response = await GET(new Request("https://ui.test/api/audit?limit=500"));
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("returns empty list without mock fallback", async () => {
    setAuthSessionRoles(["admin"]);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ logs: [] })));
    const response = await GET(new Request("https://ui.test/api/audit?limit=10"));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toEqual({ logs: [] });
  });

  it("returns FORBIDDEN for non-admin session", async () => {
    setAuthSessionRoles(["editor"]);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const response = await GET(new Request("https://ui.test/api/audit"));
    const data = await response.json();
    expect(response.status).toBe(403);
    expect(data.code).toBe("FORBIDDEN");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns AUTH_REQUIRED when no session", async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const response = await GET(new Request("https://ui.test/api/audit"));
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
