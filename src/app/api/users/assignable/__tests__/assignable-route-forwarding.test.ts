import { describe, expect, it, vi, beforeEach } from "vitest";

import type { ListAssignableUsersResponseDto } from "@/server/backend/contracts/maintmode-dto";

/**
 * SPEC §4.0, applied one layer down.
 *
 * The hook tests model the endpoint and assert the query string the HOOK emits.
 * Nothing asserted that this route FORWARDS it. That is the same shape of gap
 * §4.0 diagnosed — "a fully mocked transport verifies the request you send, never
 * the answer you get" — relocated from `bffFetch` to the BFF proxy: every hook
 * test replaces `bffFetch` wholesale, so the route between it and the backend was
 * never executed by any test in the repository.
 *
 * It matters because the route is where `roles` and `limit` can still be lost.
 * Deleting the `roles` forwarding loop, or the `limit` `forwardInt` call, left
 * the entire 1022-test suite green — and either one reproduces the original P0
 * exactly: `roles` gone means the picker filters a truncated page client-side,
 * `limit` gone means the backend quietly answers 50 (SPEC §1.1 row 3).
 */

const backendRequest = vi.fn<(opts: { path: string }) => Promise<ListAssignableUsersResponseDto>>();
vi.mock("@/server/backend/client/authenticated-backend-request", () => ({
  authenticatedBackendRequest: (opts: { path: string }) => backendRequest(opts),
}));

import { GET } from "../route";

beforeEach(() => {
  // Both calls are required under vitest 4 — see audit-route-envelope.test.ts.
  backendRequest.mockReset();
  backendRequest.mockClear();
  backendRequest.mockResolvedValue({ users: [], total: 0 } as ListAssignableUsersResponseDto);
});

/** Invoke the route with a raw query string and return the backend query it built. */
async function backendQueryFor(query: string): Promise<URLSearchParams> {
  await GET(new Request(`http://localhost/api/users/assignable?${query}`));
  const path = backendRequest.mock.calls[0]?.[0].path ?? "";
  return new URLSearchParams(path.split("?")[1] ?? "");
}

describe("GET /api/users/assignable — filter forwarding (SPEC §2.1, AC-2)", () => {
  it("forwards every repeated `roles` value to the backend", async () => {
    const query = await backendQueryFor("limit=200&roles=reviewer&roles=admin");

    // The approver picker's whole correctness rests on this reaching the backend:
    // the server applies `roles` BEFORE truncating to `limit`, the client can only
    // filter after (SPEC §0.1).
    expect(query.getAll("roles")).toEqual(["reviewer", "admin"]);
  });

  it("forwards `limit` so the backend does not fall back to its default of 50", async () => {
    const query = await backendQueryFor("limit=200&roles=reviewer&roles=admin");

    expect(query.get("limit")).toBe("200");
  });

  it("forwards `search` and `offset` alongside the role filter", async () => {
    const query = await backendQueryFor("limit=200&offset=400&search=ali&roles=admin");

    expect(query.get("search")).toBe("ali");
    expect(query.get("offset")).toBe("400");
    expect(query.getAll("roles")).toEqual(["admin"]);
  });

  it("returns `total` from the backend so the over-limit warning can fire", async () => {
    // AC-12: `total` is the ONLY mechanism by which the RUK-218 §13.1 review
    // trigger can ever be observed. The route dropping it silences both hooks'
    // dev warnings with no other symptom.
    backendRequest.mockResolvedValue({ users: [], total: 3214 } as ListAssignableUsersResponseDto);

    const body = await (await GET(new Request("http://localhost/api/users/assignable?limit=200"))).json();

    expect(body.total).toBe(3214);
  });

  it("falls back to the row count when the backend omits `total`", async () => {
    backendRequest.mockResolvedValue({
      users: [{ id: "u-1", display_name: "A", email: "a@x", roles: ["admin"] }],
    } as ListAssignableUsersResponseDto);

    const body = await (await GET(new Request("http://localhost/api/users/assignable?limit=200"))).json();

    expect(body.total).toBe(1);
  });

  describe("input sanitising", () => {
    it("drops a non-numeric `limit` rather than forwarding it", async () => {
      const query = await backendQueryFor("limit=abc&roles=admin");

      expect(query.get("limit")).toBeNull();
      // The roles filter must survive the rejected limit.
      expect(query.getAll("roles")).toEqual(["admin"]);
    });

    it("caps the repeated `roles` filter so a crafted request cannot amplify", async () => {
      const many = Array.from({ length: 40 }, (_, i) => `roles=r${i}`).join("&");

      const query = await backendQueryFor(many);

      expect(query.getAll("roles")).toHaveLength(32);
    });
  });

  it("surfaces a backend failure instead of answering with an empty roster", async () => {
    // AC-10 at the transport layer: a 403 (the normal answer for a guest — the
    // endpoint is permission gated, SPEC §1.3) must not degrade into `{users: []}`,
    // which the picker would render as "No people found."
    backendRequest.mockRejectedValue(new Error("forbidden"));

    const response = await GET(new Request("http://localhost/api/users/assignable?limit=200"));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await response.json()).users).toBeUndefined();
  });
});
