import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/resources/route";

describe("/api/resources POST", () => {
  beforeEach(() => {
    process.env.MAINTMODE_API_BASE_URL = "https://backend.test";
    process.env.MAINTMODE_API_TIMEOUT_MS = "1000";
    delete process.env.MAINTMODE_ENABLE_MOCK_DATA;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("creates a resource and returns 201 with the normalized payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          id: "r1",
          name: "Primary DB",
          description: "Main postgres cluster",
          external_id: "ext-1",
          created_at: "2026-05-01T10:00:00Z",
        }),
      ),
    );

    const response = await POST(
      jsonRequest({ name: "Primary DB", description: "Main postgres cluster", external_id: "ext-1" }),
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toEqual({
      resource: {
        id: "r1",
        name: "Primary DB",
        description: "Main postgres cluster",
        externalId: "ext-1",
        createdAt: "2026-05-01T10:00:00Z",
      },
    });
  });

  it("rejects an empty body with VALIDATION_ERROR", async () => {
    const response = await POST(jsonRequest({}));
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(data.fieldErrors)).toBe(true);
    expect(data.fieldErrors.map((f: { field: string }) => f.field)).toContain("name");
  });

  it("normalizes backend 409 to CONFLICT", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ code: "ALREADY_EXISTS", message: "duplicate" }, 409)),
    );
    const response = await POST(
      jsonRequest({ name: "Primary DB", description: "Main postgres cluster" }),
    );
    const data = await response.json();
    expect(response.status).toBe(409);
    expect(data.code).toBe("ALREADY_EXISTS");
  });

  it("normalizes backend 401 to AUTH_REQUIRED", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ code: "TOKEN_INVALID", message: "Unauthorized" }, 401)),
    );
    const response = await POST(
      jsonRequest({ name: "Primary DB", description: "Main postgres cluster" }),
    );
    const data = await response.json();
    expect(response.status).toBe(401);
    expect(data.code).toBe("AUTH_REQUIRED");
  });
});

function jsonRequest(body: unknown) {
  return new Request("https://ui.test/api/resources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
