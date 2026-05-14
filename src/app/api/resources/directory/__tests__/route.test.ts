import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/resources/directory/route";

describe("/api/resources/directory route", () => {
  beforeEach(() => {
    process.env.MAINTMODE_API_BASE_URL = "https://backend.test";
    process.env.MAINTMODE_API_TIMEOUT_MS = "1000";
    delete process.env.MAINTMODE_ENABLE_MOCK_DATA;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns normalized resource directory items", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          resources: [
            {
              id: "r1",
              name: "Primary DB",
              description: "Main postgres cluster",
              external_id: "ext-1",
              created_at: "2026-04-01T10:00:00Z",
              updated_at: "2026-04-10T12:00:00Z",
            },
          ],
        }),
      ),
    );

    const response = await GET(new Request("https://ui.test/api/resources/directory"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      resources: [
        {
          id: "r1",
          name: "Primary DB",
          description: "Main postgres cluster",
          externalId: "ext-1",
          createdAt: "2026-04-01T10:00:00Z",
          updatedAt: "2026-04-10T12:00:00Z",
        },
      ],
    });
  });

  it("passes the empty list through without falling back to mock data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ resources: [] })));
    const response = await GET(new Request("https://ui.test/api/resources/directory?name=zzz"));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toEqual({ resources: [] });
  });

  it("normalizes backend 401 to AUTH_REQUIRED", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ code: "TOKEN_INVALID", message: "Unauthorized" }, 401)),
    );
    const response = await GET(new Request("https://ui.test/api/resources/directory"));
    const data = await response.json();
    expect(response.status).toBe(401);
    expect(data.code).toBe("AUTH_REQUIRED");
  });

  it("normalizes backend 503 without mock fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ code: "BACKEND_DOWN", message: "down" }, 503)),
    );
    const response = await GET(new Request("https://ui.test/api/resources/directory"));
    const data = await response.json();
    expect(response.status).toBe(503);
    expect(data.code).toBe("BACKEND_DOWN");
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
