import { describe, expect, it, vi, beforeEach } from "vitest";

import { createBackendMock, readWireFixture } from "./_harness";
import { expectWireFields, expectNullableWireFields, type FieldSpec } from "./_wire-assertions";

/**
 * Contract test — `GET /api/me`. RUK-254, SPEC-RUK-254.md §4.1/§4.5.
 *
 * `me` is here because of RUK-202: `timezone` was a NEW backend field, and the
 * frontend's timezone work blocked on whether it had actually shipped. That
 * question was answered by reading a swagger file in another repository — the
 * same source that documented the step endpoints as 409 while they answered
 * 400/500 (SPEC §0.3). The recorded capture answers it from the wire instead.
 *
 * The route is a thin pass-through, so "does the response reach the client" is
 * nearly tautological — except in one direction that has already bitten:
 * `NextResponse.json(data)` forwards the WHOLE body, and a route narrowing it
 * to a hand-picked field list would silently drop a field the settings screen
 * reads. The pass-through test below is what fails if anyone does that.
 */

const wire = readWireFixture("me.json");

const backendRequest = createBackendMock<unknown>(wire);
vi.mock("@/server/backend/client/authenticated-backend-request", () => ({
  authenticatedBackendRequest: (opts: { path: string; method: string }) => backendRequest(opts),
}));

// `GET /api/me` signs the browser out on a backend 404, so both of these are
// pulled into the module graph. Stubbed to keep the route a pure transport test
// — a real `signOut` would reach for NextAuth's request context, which does not
// exist here.
const signOut = vi.fn();
const clearActiveSession = vi.fn();
vi.mock("@/server/auth/auth-config", () => ({ signOut: () => signOut() }));
vi.mock("@/server/auth/session-token", () => ({ clearActiveSession: () => clearActiveSession() }));

const { GET } = await import("@/app/api/me/route");
const { BackendRequestError } = await import("@/server/backend/errors/backend-request-error");

// The backend mock resets itself (see `_harness`); these two are this file's own.
beforeEach(() => {
  signOut.mockClear();
  clearActiveSession.mockClear();
});

describe("GET /api/me — request forwarding", () => {
  it("asks the AUTH service for the current user", async () => {
    // `me` lives on the auth base, not the maintmode base. Losing that routes
    // the request at the wrong service, which answers 404 — and this route
    // reads a 404 as "your account is gone" and signs the user OUT. A
    // forwarding slip here logs everybody out.
    await GET();

    expect(backendRequest).toHaveBeenCalledTimes(1);
    expect(backendRequest.mock.calls[0]?.[0]).toMatchObject({
      path: "/api/v1/me",
      method: "GET",
      useAuthBase: true,
    });
  });
});

/**
 * The wire contract, as INDEPENDENT literals.
 *
 * Not derived from `wire`: an expectation read back out of the fixture under
 * test holds under every mutation of that fixture, so it would stay green while
 * the contract moved. These are what the app asserts the backend sends.
 */
const REQUIRED_ME_FIELDS: readonly FieldSpec[] = [
  ["id", "string"],
  ["email", "string"],
  ["display_name", "string"],
  ["roles", "array"],
];

/**
 * Present on the wire but legitimately `null` for a user who has set nothing.
 * The KEY must exist — that is what distinguishes "the backend supports this
 * preference" from "the backend has never heard of it", and the whole of
 * RUK-202 turned on that difference.
 */
const REQUIRED_NULLABLE_ME_FIELDS: readonly FieldSpec[] = [
  ["timezone", "string"],
  ["telegram_tag", "string"],
  ["slack_tag", "string"],
];

describe("GET /api/me — the recorded response still matches the contract", () => {
  it("carries every field the app shell and settings screen depend on, with the right type", () => {
    // Types, not just presence. An earlier version asked only `field in wire`,
    // and a mutation audit rewrote `id` to `999`, `email` to `42` and
    // `display_name` to `null` with the whole suite still green. The backend is
    // Go: a zero value serialises rather than disappearing, so a string id going
    // numeric is a plausible one-line change upstream that the mapper would
    // coerce in silence.
    expectWireFields([wire as Record<string, unknown>], REQUIRED_ME_FIELDS, "me");
  });

  it("carries `timezone` as a key, proving RUK-202 shipped (value may be null)", () => {
    // The distinction that matters: `"timezone": null` means the backend models
    // the preference and this user has not set one. An ABSENT key means the
    // field does not exist on the wire, and the settings screen is writing into
    // a void — the class-B shape of RUK-192 and RUK-171. `{}` in that slot is a
    // third thing again, and used to pass.
    expectNullableWireFields([wire as Record<string, unknown>], REQUIRED_NULLABLE_ME_FIELDS, "me");
  });
});

describe("GET /api/me — response pass-through", () => {
  it("hands the client every field the backend sent, unnarrowed", async () => {
    // A route that projected `me` onto a hand-picked field list would drop new
    // backend fields silently — `timezone` would have been invisible to the UI
    // for the whole of RUK-202 with no error anywhere.
    const body = await (await GET()).json();

    expect(Object.keys(body).sort()).toEqual(Object.keys(wire).sort());
  });
});

describe("GET /api/me — errors must not degrade into an anonymous-looking user", () => {
  it("answers with an error status when the backend fails", async () => {
    // A `me` that degrades into `{}` or `{roles: []}` reads to the UI as a
    // signed-in user with no permissions: menus vanish, actions grey out, and
    // it looks like a permissions bug rather than an outage. Same degradation
    // shape as the approver-picker P0.
    backendRequest.mockRejectedValue(new Error("backend exploded"));

    const response = await GET();

    expect(response.status).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body.id).toBeUndefined();
    expect(body.roles).toBeUndefined();
  });

  it("turns a backend 404 into 401 AUTH_REQUIRED and clears the dead session", async () => {
    // Documented behaviour worth pinning: a valid JWT for a deleted account.
    // Answering 404 to the client would leave `bffFetch` with nothing to
    // redirect on, and the dead cookie would loop.
    backendRequest.mockRejectedValue(new BackendRequestError(404, "user not found"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe("AUTH_REQUIRED");
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(clearActiveSession).toHaveBeenCalledTimes(1);
  });
});
