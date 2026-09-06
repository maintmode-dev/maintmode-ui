import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Contract test — `POST /api/me/password` → backend `POST /api/v1/me/password`.
 * RUK-289, SPEC §1.3, §3.3, §3.4.
 *
 * **Why there is no recorded fixture here, and why that does not excuse the
 * test.** `scripts/refresh-fixtures.mjs` issues GET only and refuses any
 * non-2xx, while this seam is a POST whose success is `204` with an empty body
 * and whose interesting shapes are the error envelopes the recorder rejects
 * (SPEC §7.3). So the contract policy's four questions are answered against a
 * stubbed `fetch` rather than a fixture:
 *
 *   1. are the fields forwarded — including the two whose ABSENCE is meaningful?
 *   2. does the response reach the client unchanged (204 stays 204)?
 *   3. does a backend error stay an error, rather than degrading into success?
 *   4. is the expectation independent of the thing it checks — the assertions
 *      read the request off the `fetch` stub, not off the arguments passed in.
 *
 * The seam matters more than most: SPEC §7.3 lists "a wrong `current_password`
 * moving off 401" as a drift no automated check would catch, and this is the
 * check that catches it. It is here rather than only in the unit suite because
 * `npm run test:contracts` is what a reviewer reads as "the contracts are
 * green", and a route absent from it is a route that claim does not cover.
 */

const readActiveSession = vi.fn();
vi.mock("@/server/auth/session-token", () => ({
  readActiveSession: () => readActiveSession(),
}));
vi.mock("@/server/backend/security/csrf", () => ({ isSameOriginRequest: () => true }));

const { POST } = await import("@/app/api/me/password/route");

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  process.env.MAINTMODE_API_BASE_URL = "http://backend.test/maintmode";
  readActiveSession.mockResolvedValue({
    accessToken: "access-1",
    refreshToken: "refresh-1",
    accessTokenExpiresAt: Date.now() + 600_000,
  });
});

afterEach(() => vi.unstubAllGlobals());

function backendAnswers(status: number, body = "") {
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: `status ${status}`,
    text: async () => body,
  });
}

function post(body: unknown) {
  return new Request("https://app.test/api/me/password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** What actually went on the wire, read from the stub rather than the input. */
function wireRequest() {
  const [url, init] = fetchMock.mock.calls[0];
  return { url: String(url), init, body: JSON.parse(init.body) as Record<string, unknown> };
}

describe("me/password — request forwarding", () => {
  it("posts to the auth base's password path with a bearer credential", async () => {
    backendAnswers(204);

    await POST(post({ current_password: "old", new_password: "a-long-enough-password" }));

    const { url, init } = wireRequest();
    expect(url).toContain("/api/v1/me/password");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer access-1");
  });

  it("forwards refresh_token, which is what keeps the caller signed in", async () => {
    backendAnswers(204);

    await POST(post({ current_password: "old", new_password: "a-long-enough-password" }));

    // Dropping it makes the backend revoke every session including this one, so
    // the operator is signed out by their own success (SPEC §1.3).
    expect(wireRequest().body).toEqual({
      current_password: "old",
      new_password: "a-long-enough-password",
      refresh_token: "refresh-1",
    });
  });

  it("omits current_password as a KEY when the caller sent none", async () => {
    backendAnswers(204);

    await POST(post({ new_password: "a-long-enough-password" }));

    // Absent and empty are different requests: the backend rejects the field
    // outright for an account that has no password.
    expect("current_password" in wireRequest().body).toBe(false);
  });
});

describe("me/password — response pass-through", () => {
  it("hands 204 to the client as 204 with no body", async () => {
    backendAnswers(204);

    const response = await POST(post({ new_password: "a-long-enough-password" }));

    expect(response.status).toBe(204);
    await expect(response.text()).resolves.toBe("");
  });
});

describe("me/password — a backend error stays an error", () => {
  // The degradation this guards against is not an empty list but a false
  // success: reporting 2xx for a password the backend never changed.
  it("does not turn a backend failure into a success", async () => {
    for (const status of [400, 401, 403, 500, 503]) {
      fetchMock.mockReset();
      backendAnswers(status, '{"code":"unauthorized"}');

      const response = await POST(post({ new_password: "a-long-enough-password" }));

      expect(response.status).not.toBe(204);
      expect(response.status).toBeGreaterThanOrEqual(400);
    }
  });

  // SPEC §7.3's drift #2, pinned. If the backend moves a wrong current password
  // off 401, this fails — and without it the change would reach the generic
  // mapper, which answers AUTH_REQUIRED and signs the operator out with no
  // message on their most common mistake.
  it("keeps a wrong current password renderable rather than signing the user out", async () => {
    backendAnswers(401, '{"code":"unauthorized","message":"invalid credentials"}');

    const response = await POST(post({ current_password: "wrong", new_password: "a-long-enough-password" }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ code: "WRONG_CURRENT_PASSWORD" });
  });

  it("distinguishes a stale refresh token, which changed nothing", async () => {
    backendAnswers(401, '{"code":"unauthorized"}');

    const response = await POST(post({ new_password: "a-long-enough-password" }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "SESSION_STALE" });
  });

  it("passes a 400 through with the backend's own message, unparsed", async () => {
    backendAnswers(400, "validation error: password does not meet the length policy");

    const response = await POST(post({ new_password: "a-long-enough-password" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "validation error: password does not meet the length policy",
    });
  });

  it("answers an unreachable backend as an outage", async () => {
    fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const response = await POST(post({ new_password: "a-long-enough-password" }));

    expect(response.status).toBe(503);
  });
});
