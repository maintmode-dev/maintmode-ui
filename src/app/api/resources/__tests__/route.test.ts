import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/resources/route";

describe("/api/resources route", () => {
  beforeEach(() => {
    process.env.MAINTMODE_API_BASE_URL = "https://backend.test";
    process.env.MAINTMODE_API_TIMEOUT_MS = "1000";
    delete process.env.MAINTMODE_ENABLE_MOCK_DATA;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns normalized backend errors and never silently falls back to mock data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ code: "BACKEND_DOWN", message: "resources down" }, 503)),
    );

    const response = await GET(new Request("https://ui.test/api/resources"));
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data).toEqual({
      error: "resources down",
      code: "BACKEND_DOWN",
      hint: "The frontend did not fall back to mock data; check backend availability.",
    });
  });

  it("propagates backend 401 as the normalized AUTH_REQUIRED payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ code: "TOKEN_INVALID", message: "Unauthorized" }, 401)),
    );

    const response = await GET(new Request("https://ui.test/api/resources"));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.code).toBe("AUTH_REQUIRED");
  });

  it("returns the normalized resource catalog on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          resources: [{ id: "r1", name: "Primary DB", type: "database" }],
        }),
      ),
    );

    const response = await GET(new Request("https://ui.test/api/resources"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      resources: [{ id: "r1", name: "Primary DB", type: "database" }],
    });
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}
