import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/maintenance/[id]/actions/[action]/route";

type FetchCall = {
  url: URL;
  init?: RequestInit;
};

const detailResponse = {
  maintenance: {
    id: "m1",
    title: "DB upgrade",
    description: "Upgrade primary database safely",
    planned_time_start: "2026-02-20T10:00:00Z",
    planned_time_end: "2026-02-20T10:30:00Z",
    resources: [],
    scope: "global",
    impact: "none",
    status: "in_progress",
    created_at: "2026-02-19T08:00:00Z",
    revision: 2,
  },
  conflicts: [],
  actions: {
    can_approve: false,
    can_cancel: true,
    can_edit: false,
    can_finish: true,
    can_start: false,
  },
};

describe("/api/maintenance/[id]/actions/[action] route", () => {
  beforeEach(() => {
    process.env.MAINTMODE_API_BASE_URL = "https://backend.test";
    process.env.MAINTMODE_API_TIMEOUT_MS = "1000";
    delete process.env.MAINTMODE_ENABLE_MOCK_DATA;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("forwards start to the backend without a body", async () => {
    const calls: FetchCall[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        calls.push({ url, init });
        if (url.pathname === "/api/v1/maintenances/m1/start") {
          return new Response(null, { status: 204 });
        }
        return jsonResponse(detailResponse);
      }),
    );

    const response = await POST(new Request("https://ui.test/api/maintenance/m1/actions/start", { method: "POST" }), {
      params: Promise.resolve({ id: "m1", action: "start" }),
    });

    expect(response.status).toBe(200);
    const startCall = calls.find((call) => call.url.pathname === "/api/v1/maintenances/m1/start");
    expect(startCall?.init?.body).toBeUndefined();
    expect(startCall?.init?.headers).toEqual(
      expect.objectContaining({ accept: "application/json", authorization: "Bearer test-access-token" }),
    );
  });

  it("requires a reason for cancel and forwards it as JSON", async () => {
    const calls: FetchCall[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        calls.push({ url, init });
        if (url.pathname === "/api/v1/maintenances/m1/cancel") {
          return new Response(null, { status: 204 });
        }
        return jsonResponse(detailResponse);
      }),
    );

    const response = await POST(
      new Request("https://ui.test/api/maintenance/m1/actions/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "incident", comment: "DB outage" }),
      }),
      { params: Promise.resolve({ id: "m1", action: "cancel" }) },
    );

    expect(response.status).toBe(200);
    const cancelCall = calls.find((call) => call.url.pathname === "/api/v1/maintenances/m1/cancel");
    expect(JSON.parse(String(cancelCall?.init?.body))).toEqual({
      reason: "incident",
      comment: "DB outage",
    });
  });

  it("rejects invalid actions with a typed validation error", async () => {
    const response = await POST(
      new Request("https://ui.test/api/maintenance/m1/actions/destroy", { method: "POST" }),
      { params: Promise.resolve({ id: "m1", action: "destroy" }) },
    );
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  it("rejects cancel comment longer than 2000 characters", async () => {
    const response = await POST(
      new Request("https://ui.test/api/maintenance/m1/actions/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "incident", comment: "x".repeat(2001) }),
      }),
      { params: Promise.resolve({ id: "m1", action: "cancel" }) },
    );
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.fieldErrors?.[0].field).toBe("comment");
    expect(data.fieldErrors?.[0].message).toMatch(/at most 2000/);
  });

  it("rejects cancel without reason", async () => {
    const response = await POST(
      new Request("https://ui.test/api/maintenance/m1/actions/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "m1", action: "cancel" }) },
    );
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.fieldErrors?.[0].field).toBe("reason");
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
