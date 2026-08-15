import { describe, expect, it, vi } from "vitest";

import { createBackendMock, readWireFixture, backendQuery } from "./_harness";
import { expectWireFields, type FieldSpec } from "./_wire-assertions";

import type { ListAssignableUsersResponseDto } from "@/server/backend/contracts/maintmode-dto";

/**
 * Contract test — `GET /api/users/assignable`. RUK-254, SPEC-RUK-254.md §4.1/§4.5.
 *
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
 *
 * The response the backend gives is now the RECORDED one
 * (`tests/fixtures/wire/users-assignable.json`) rather than the `{users: [],
 * total: 0}` literal this file used to declare. That literal was doubly weak:
 * it pinned no row shape at all, so the picker's fields could vanish from the
 * wire with nothing here noticing, and it was an author's BELIEF about the
 * endpoint rather than its answer (SPEC §4.1, point 4).
 */

const wire = readWireFixture<ListAssignableUsersResponseDto>("users-assignable.json");

const backendRequest = createBackendMock(wire);
vi.mock("@/server/backend/client/authenticated-backend-request", () => ({
  authenticatedBackendRequest: (opts: { path: string }) => backendRequest(opts),
}));

const { GET } = await import("@/app/api/users/assignable/route");

/** Invoke the route with a raw query string and return the backend query it built. */
async function backendQueryFor(query: string): Promise<URLSearchParams> {
  await GET(new Request(`http://localhost/api/users/assignable?${query}`));
  return backendQuery(backendRequest);
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

  it("passes the recorded roster through to the client without dropping rows", async () => {
    // Pass-through on the RECORDED response (SPEC §4.1, point 2): the route
    // must hand the picker every user the backend listed. A filter or slice
    // sneaking in here reproduces the P0 — a truncated roster that still looks
    // like a successful answer.
    const body = await (await GET(new Request("http://localhost/api/users/assignable?limit=200"))).json();

    expect(body.users).toHaveLength((wire.users ?? []).length);
  });

  it("returns `total` from the backend so the over-limit warning can fire", async () => {
    // AC-12: `total` is the ONLY mechanism by which the RUK-218 §13.1 review
    // trigger can ever be observed. The route dropping it silences both hooks'
    // dev warnings with no other symptom.
    //
    // Asserted against a value the fixture does NOT carry, so this cannot pass
    // by the route inventing a count from the row length: the recorded capture
    // holds 12 sampled rows, and 3214 can only arrive by being forwarded.
    backendRequest.mockResolvedValue({ ...wire, total: 3214 });

    const body = await (await GET(new Request("http://localhost/api/users/assignable?limit=200"))).json();

    expect(body.total).toBe(3214);
  });

  it("falls back to the row count when the backend omits `total`", async () => {
    const oneRow = (wire.users ?? []).slice(0, 1);
    backendRequest.mockResolvedValue({ users: oneRow } as ListAssignableUsersResponseDto);

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

  /**
   * RUK-270, SPEC §1 / AC-1..AC-3.
   *
   * The sibling case below covers a REJECTED backend call. These cover the other
   * half — a backend that answers `200` with a body carrying no `users` array.
   * That shape used to be normalised here into `{users: [], total: 0}`, which is
   * indistinguishable from a real empty roster by the time it reaches the picker,
   * so the operator read "No people found." for what was actually a broken
   * response (measured: SPEC §1's table).
   *
   * Asserted the same way as that sibling — status and the absence of `users` —
   * rather than on an error code: the route throws a bare `Error`, and a
   * dedicated code was considered and cut for want of any consumer (SPEC §6).
   */
  describe("a 200 whose body carries no `users` array is an error, not an empty roster", () => {
    const MALFORMED: ReadonlyArray<readonly [string, unknown]> = [
      ["the key is absent", {}],
      ["the key is null", { users: null }],
      // Non-array is the shape a truthiness guard would let through. At THIS
      // layer it already 500s via the `.map` TypeError, so the case does not
      // discriminate the two guards here — it is pinned so the route rejects it
      // deliberately rather than by accident of a downstream crash. The guard it
      // does discriminate lives at the hooks (SPEC §1.3).
      ["the key is not an array", { users: "alice" }],
    ];

    it.each(MALFORMED)("rejects a backend 200 where %s", async (_label, body) => {
      backendRequest.mockResolvedValue(body as ListAssignableUsersResponseDto);

      const response = await GET(new Request("http://localhost/api/users/assignable?limit=200"));

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect((await response.json()).users).toBeUndefined();
    });

    it("still passes a genuinely empty roster through as a success", async () => {
      // The other half of the contract, and the reason the guard tests
      // `Array.isArray` rather than emptiness: `{users: [], total: 0}` is the
      // VALID way to say "nobody", and it must keep reaching the picker as a
      // successful empty list so the copy stays "No people found." (AC-4).
      backendRequest.mockResolvedValue({ users: [], total: 0 });

      const response = await GET(new Request("http://localhost/api/users/assignable?limit=200"));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.users).toEqual([]);
      expect(body.total).toBe(0);
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

/**
 * The wire contract, written as INDEPENDENT literals.
 *
 * Deliberately not derived from `wire`. An expectation read back out of the
 * fixture under test is a tautology — it survives every mutation of that
 * fixture, so the suite stays green while the contract moves. These literals are
 * what a human asserts the picker needs; the fixture is what the backend
 * actually sent. Only where the two can disagree does the test mean anything.
 */
const REQUIRED_USER_FIELDS: readonly FieldSpec[] = [
  ["id", "string"],
  ["email", "string"],
  ["display_name", "string"],
  ["roles", "array"],
];

describe("GET /api/users/assignable — the recorded response still matches the contract", () => {
  it("carries every field the approver picker depends on, with the right type", () => {
    // Type included: `roles` arriving as a comma-joined string instead of an
    // array is exactly the change that leaves every hook test green while the
    // role filter matches nothing — the original P0, one layer up.
    expectWireFields(
      (wire.users ?? []) as unknown as Record<string, unknown>[],
      REQUIRED_USER_FIELDS,
      "assignable users",
    );
  });

  it("records role MEMBERS as strings, the values the filter compares against", () => {
    // `roles` being an array is covered by the type table above. What that
    // cannot express is the element type: an array of `{name}` objects instead
    // of strings passes an `Array.isArray` check and then matches nothing in the
    // picker's `includes()`.
    //
    // The guard on emptiness is deliberate. `[].every(...)` is `true`, so the
    // previous version of this test passed on a capture with no users at all —
    // a green test asserting nothing, which is how an endpoint reads as covered
    // when it is not.
    const users = wire.users ?? [];
    expect(users.length).toBeGreaterThan(0);

    const withRoles = users.filter((user) => (user.roles ?? []).length > 0);
    expect(`users carrying at least one role: ${withRoles.length > 0 ? "some" : "NONE"}`).toBe(
      "users carrying at least one role: some",
    );

    const nonString = withRoles
      .flatMap((user) => user.roles ?? [])
      .filter((role) => typeof role !== "string");
    expect(`non-string role members: ${nonString.length}`).toBe("non-string role members: 0");
  });
});
