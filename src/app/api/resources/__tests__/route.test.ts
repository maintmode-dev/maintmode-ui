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

  it("returns normalized backend errors by default instead of mock resources", async () => {
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

  it("uses explicit local mock resources only when MAINTMODE_ENABLE_MOCK_DATA is true", async () => {
    process.env.MAINTMODE_ENABLE_MOCK_DATA = "true";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ code: "BACKEND_DOWN", message: "resources down" }, 503)),
    );

    const response = await GET(new Request("https://ui.test/api/resources"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      resources: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          name: "Mock service",
          type: "service",
        },
      ],
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
