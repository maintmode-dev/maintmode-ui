import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/maintenance/route";

type FetchCall = {
  url: URL;
  init?: RequestInit;
};

const resourcesResponse = {
  resources: [{ id: "r1", name: "Primary DB", type: "database" }],
};

const detailResponse = {
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
    revision: 1,
    steps: [
      {
        id: "s1",
        order: 1,
        description: "Apply migration",
        rollback_description: "Restore backup",
        duration: "30m",
        status: "planned",
        planned_time_start: "2026-02-20T10:00:00Z",
        planned_time_end: "2026-02-20T10:30:00Z",
      },
    ],
  },
  conflicts: [],
  actions: {
    can_approve: true,
    can_cancel: true,
    can_edit: true,
    can_finish: false,
    can_start: false,
  },
};

describe("/api/maintenance route", () => {
  beforeEach(() => {
    process.env.MAINTMODE_API_BASE_URL = "https://backend.test";
    process.env.MAINTMODE_API_TIMEOUT_MS = "1000";
    delete process.env.MAINTMODE_ENABLE_MOCK_DATA;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends calendar status and resource filters to backend as repeated query keys", async () => {
    const calls: FetchCall[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        calls.push({ url, init });

        if (url.pathname === "/ui/v1/calendar") {
          return jsonResponse({
            events: [
              {
                id: "m1",
                title: "DB upgrade",
                status: "planned",
                scope: "resource",
                impact: "partial_outage",
                start: "2026-02-20T10:00:00Z",
                end: "2026-02-20T10:30:00Z",
                resource_ids: ["r1"],
              },
              {
                id: "m2",
                title: "Global deploy",
                status: "planned",
                scope: "global",
                impact: "none",
                start: "2026-02-20T11:00:00Z",
                end: "2026-02-20T11:30:00Z",
              },
            ],
            meta: {
              count: 2,
              truncated: false,
            },
          });
        }

        if (url.pathname === "/api/v1/resources") {
          return jsonResponse(resourcesResponse);
        }

        return jsonResponse({ code: "NOT_FOUND", message: "not found" }, 404);
      }),
    );

    const response = await GET(
      new Request(
        "https://ui.test/api/maintenance?from=2026-02-20&to=2026-02-21&statuses=planned,draft&statuses=canceled&resource_ids=r1,r2&resource_ids=r3&scope=resource",
      ),
    );
    const data = await response.json();
    const calendarCall = calls.find((call) => call.url.pathname === "/ui/v1/calendar");

    expect(response.status).toBe(200);
    expect(calendarCall?.url.searchParams.get("from")).toBe("2026-02-20");
    expect(calendarCall?.url.searchParams.get("to")).toBe("2026-02-21");
    expect(calendarCall?.url.searchParams.getAll("statuses")).toEqual(["planned", "draft", "canceled"]);
    expect(calendarCall?.url.searchParams.getAll("resource_ids")).toEqual(["r1", "r2", "r3"]);
    expect(data.maintenances).toHaveLength(1);
    expect(data.maintenances[0]).toMatchObject({
      id: "m1",
      resources: [{ id: "r1", name: "Primary DB", type: "database" }],
    });
    expect(data.meta).toEqual({
      count: 1,
      truncated: false,
    });
  });

  it("returns normalized calendar backend errors instead of mock data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));

        if (url.pathname === "/ui/v1/calendar") {
          return jsonResponse({ code: "BACKEND_DOWN", message: "calendar down" }, 503);
        }

        if (url.pathname === "/api/v1/resources") {
          return jsonResponse(resourcesResponse);
        }

        return jsonResponse({ code: "NOT_FOUND", message: "not found" }, 404);
      }),
    );

    const response = await GET(new Request("https://ui.test/api/maintenance?from=2026-02-20&to=2026-02-21"));
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data).toEqual({
      error: "calendar down",
      code: "BACKEND_DOWN",
      hint: "The frontend did not fall back to mock data; check backend availability.",
    });
  });

  it("sends create payload as planned_start plus steps and never planned_period", async () => {
    const calls: FetchCall[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        calls.push({ url, init });

        if (url.pathname === "/api/v1/resources") {
          return jsonResponse(resourcesResponse);
        }

        if (url.pathname === "/api/v1/maintenances/create") {
          return jsonResponse({
            id: "m1",
            title: "DB upgrade",
            description: "Upgrade primary database safely",
            planned_period: {
              start: "2026-02-20T10:00:00Z",
              end: "2026-02-20T10:30:00Z",
            },
            resources: [{ id: "r1", type: "database" }],
            scope: "resource",
            impact: "partial_outage",
            status: "draft",
            created_at: "2026-02-19T08:00:00Z",
            steps: [],
          });
        }

        if (url.pathname === "/ui/v1/maintenances/m1") {
          return jsonResponse(detailResponse);
        }

        return jsonResponse({ code: "NOT_FOUND", message: "not found" }, 404);
      }),
    );

    const response = await POST(
      new Request("https://ui.test/api/maintenance", {
        method: "POST",
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
    );
    const createCall = calls.find((call) => call.url.pathname === "/api/v1/maintenances/create");
    const createPayload = JSON.parse(String(createCall?.init?.body));

    expect(response.status).toBe(201);
    expect(createPayload).toEqual({
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
    expect(createPayload).not.toHaveProperty("planned_period");
  });

  it.each([
    ["missing steps", { steps: undefined }, "steps"],
    [
      "non-positive duration",
      { steps: [{ order: 1, description: "Do it", rollback_description: "Undo it", duration_minutes: 0 }] },
      "steps.0.duration_minutes",
    ],
    [
      "legacy planned_period",
      { planned_period: { start: "2026-02-20T10:00:00Z", end: "2026-02-20T11:00:00Z" } },
      "planned_period",
    ],
    ["resource scope without resources", { scope: "resource", resource_ids: [] }, "resource_ids"],
  ])("rejects invalid create payload: %s", async (_name, override, expectedField) => {
    const response = await POST(
      new Request("https://ui.test/api/maintenance", {
        method: "POST",
        body: JSON.stringify({
          title: "DB upgrade",
          description: "Upgrade primary database safely",
          planned_start_at: "2026-02-20T10:00:00Z",
          impact: "partial_outage",
          scope: "global",
          resource_ids: [],
          steps: [
            {
              order: 1,
              description: "Apply migration",
              rollback_description: "Restore backup",
              duration_minutes: 30,
            },
          ],
          ...override,
        }),
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe("VALIDATION_ERROR");
    expect(data.fieldErrors).toContainEqual(expect.objectContaining({ field: expectedField }));
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
