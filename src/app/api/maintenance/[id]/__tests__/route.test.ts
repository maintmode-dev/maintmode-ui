import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PATCH } from "@/app/api/maintenance/[id]/route";

type FetchCall = {
  url: URL;
  init?: RequestInit;
};

describe("/api/maintenance/[id] route", () => {
  beforeEach(() => {
    process.env.MAINTMODE_API_BASE_URL = "https://backend.test";
    process.env.MAINTMODE_API_TIMEOUT_MS = "1000";
    delete process.env.MAINTMODE_ENABLE_MOCK_DATA;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends edit payload as planned_start plus steps and never planned_period", async () => {
    const calls: FetchCall[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        calls.push({ url, init });

        if (url.pathname === "/api/v1/resources") {
          return jsonResponse({
            resources: [{ id: "r1", name: "Primary DB", type: "database" }],
          });
        }

        if (url.pathname === "/api/v1/maintenances/m1/edit") {
          return new Response(null, { status: 204 });
        }

        if (url.pathname === "/ui/v1/maintenances/m1") {
          return jsonResponse({
            maintenance: {
              id: "m1",
              title: "DB upgrade",
              description: "Upgrade primary database safely",
              planned_time_start: "2026-02-20T10:00:00Z",
              planned_time_end: "2026-02-20T10:30:00Z",
              resources: [{ id: "r1", name: "Primary DB", type: "database" }],
              scope: "resource",
              impact: "partial_outage",
              status: "draft",
              created_at: "2026-02-19T08:00:00Z",
              revision: 2,
            },
            conflicts: [],
            actions: {
              can_approve: true,
              can_cancel: true,
              can_edit: true,
              can_finish: false,
              can_start: false,
            },
          });
        }

        return jsonResponse({ code: "NOT_FOUND", message: "not found" }, 404);
      }),
    );

    const response = await PATCH(
      new Request("https://ui.test/api/maintenance/m1", {
        method: "PATCH",
        body: JSON.stringify({
          title: "DB upgrade",
          description: "Upgrade primary database safely",
          planned_start_at: "2026-02-20T10:00:00Z",
          planned_end_at: "2026-02-20T11:00:00Z",
          impact: "partial_outage",
          scope: "resource",
          resource_ids: ["r1"],
          steps: [
            {
              order: 1,
              description: "Apply migration",
              rollback_description: "Restore backup",
              duration_minutes: 30,
            },
          ],
        }),
      }),
      { params: Promise.resolve({ id: "m1" }) },
    );
    const editCall = calls.find((call) => call.url.pathname === "/api/v1/maintenances/m1/edit");
    const editPayload = JSON.parse(String(editCall?.init?.body));

    expect(response.status).toBe(200);
    expect(editCall?.init?.method).toBe("POST");
    expect(editPayload).toEqual({
      title: "DB upgrade",
      description: "Upgrade primary database safely",
      planned_start: "2026-02-20T10:00:00.000Z",
      impact: "partial_outage",
      scope: "resource",
      resources: [{ id: "r1", type: "database" }],
      steps: [
        {
          order: 1,
          description: "Apply migration",
          rollback_description: "Restore backup",
          duration: "30m",
        },
      ],
    });
    expect(editPayload).not.toHaveProperty("planned_period");
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
