import { beforeEach, describe, expect, it, vi } from "vitest";

import { createBackendMock, readWireFixture } from "./_harness";
import { expectWireFields, type FieldSpec } from "./_wire-assertions";

import type { AuthMethodSettingsResponseDto } from "@/server/backend/contracts/auth-methods-dto";
import { BackendRequestError } from "@/server/backend/errors/backend-request-error";

/**
 * Contract tests — the two BFF routes behind `/admin/auth-methods`. RUK-297.
 *
 * ## The case that justifies this file
 *
 * `/api/v1/auth/settings` lives on the AUTH backend, so both routes must pass
 * `useAuthBase: true`. Omitting it sends the request to the maintmode backend,
 * which answers 404 — and a 404 is precisely what this screen produces
 * legitimately until the backend branch merges. So the one mistake that breaks
 * the feature outright is also the one whose symptom the team has agreed to
 * expect. Nothing but an assertion separates them.
 *
 * ## The other one
 *
 * The 409 refusal carries the only sentence that tells an admin whether they
 * can recover — whether a break-glass credential exists. It crosses two
 * normalization layers (`routeErrorResponse` writes `error`, `bffFetch` reads
 * it), and neither layer is tested by the screen. Asserted here on the literal
 * key, so a rename on either side fails rather than silently blanking the one
 * message that matters.
 *
 * The fixture is hand-written and declared as such in the manifest: the
 * endpoint exists only on an unmerged backend branch, and the recorder captures
 * GET 200s from URLs in its own table. Error bodies are constructed in-test,
 * which is how every contract test here drives them — the recorder deliberately
 * refuses to write a non-2xx, since an error envelope is not the contract.
 */

const wire = readWireFixture<AuthMethodSettingsResponseDto>("auth-methods.json");

const backendRequest = createBackendMock<unknown>();
vi.mock("@/server/backend/client/authenticated-backend-request", () => ({
  authenticatedBackendRequest: (opts: unknown) => backendRequest(opts as { path: string }),
}));

const isSameOriginRequest = vi.fn((_request: Request) => true);
vi.mock("@/server/backend/security/csrf", () => ({
  isSameOriginRequest: (request: Request) => isSameOriginRequest(request),
}));

const requireAdminSession = vi.fn();
vi.mock("@/server/auth/require-admin", () => ({
  requireAdminSession: () => requireAdminSession(),
}));

const list = await import("@/app/api/admin/auth-methods/route");
const item = await import("@/app/api/admin/auth-methods/[method]/route");

beforeEach(() => {
  // Cleared, not just re-stubbed: these are module-level mocks shared by every
  // case, so a `not.toHaveBeenCalled()` would otherwise be asserting against
  // the whole file's history rather than against one request.
  isSameOriginRequest.mockClear();
  requireAdminSession.mockClear();
  isSameOriginRequest.mockReturnValue(true);
  requireAdminSession.mockResolvedValue(undefined);
});

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/auth-methods/email_otp", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = (method: string) => ({ params: Promise.resolve({ method }) });

/** The body the route forwarded to the backend, parsed. */
function backendBody(): Record<string, unknown> {
  const opts = backendRequest.mock.calls[0]?.[0] as { body?: string } | undefined;
  return JSON.parse(opts?.body ?? "{}") as Record<string, unknown>;
}

/** Backend failure as the client wrapper raises it. */
function backendFails(status: number, body: unknown) {
  backendRequest.mockRejectedValueOnce(
    new BackendRequestError(status, typeof body === "string" ? body : JSON.stringify(body)),
  );
}

describe("auth methods — the request reaches the auth backend", () => {
  it("asks the AUTH base for the settings path on read", async () => {
    backendRequest.mockResolvedValueOnce(wire);

    await list.GET();

    expect(backendRequest.mock.calls[0]?.[0]).toMatchObject({
      path: "/api/v1/auth/settings",
      method: "GET",
      // Without this the request goes to the maintmode backend and 404s, which
      // is indistinguishable from "the backend has not merged yet".
      useAuthBase: true,
    });
  });

  it("asks the AUTH base for the method path on write", async () => {
    backendRequest.mockResolvedValueOnce(wire.methods[0]);

    await item.PATCH(patchRequest({ enabled: false }), params("email_otp"));

    expect(backendRequest.mock.calls[0]?.[0]).toMatchObject({
      path: "/api/v1/auth/settings/email_otp",
      method: "PATCH",
      useAuthBase: true,
    });
  });
});

/**
 * The wire contract as INDEPENDENT literals — never `expect(x).toBe(recorded.x)`,
 * which holds under every mutation of the fixture.
 */
const REQUIRED_METHOD_FIELDS: readonly FieldSpec[] = [
  ["method", "string"],
  ["enabled", "boolean"],
  ["updated_at", "string"],
];

describe("auth methods — the recorded response still matches the contract", () => {
  it("carries every field the screen and its DTO are pinned to", () => {
    expectWireFields(
      wire.methods as unknown as Record<string, unknown>[],
      REQUIRED_METHOD_FIELDS,
      "auth method setting",
    );
  });

  /**
   * The fixture's CONTENTS, as literals.
   *
   * Field-type assertions alone left the fixture free to say anything: renaming
   * `email_otp` to nonsense, or trimming it to a single junk row, kept every
   * case green. That is tolerable for a recorded fixture, where the wire is the
   * author. This one is hand-written — the endpoint ships on an unmerged branch
   * — so a transcription slip has nothing to contradict it but this.
   */
  it("describes the two methods the migration seeds, both on", () => {
    expect(wire.methods.map((m) => m.method).sort()).toEqual(["email_otp", "email_password"]);
    expect(wire.methods.every((m) => m.enabled)).toBe(true);
  });
});

describe("auth methods — response pass-through", () => {
  it("hands the client every method the backend sent", async () => {
    backendRequest.mockResolvedValueOnce(wire);

    const body = (await list.GET().then((r) => r.json())) as AuthMethodSettingsResponseDto;

    expect(body.methods).toHaveLength(wire.methods.length);
    expect(body.methods.map((m) => m.method)).toEqual(wire.methods.map((m) => m.method));
    // Field-by-field, so a route that rebuilt the row and dropped one fails.
    expect(body.methods[0]).toMatchObject({
      method: wire.methods[0].method,
      enabled: wire.methods[0].enabled,
      updated_at: wire.methods[0].updated_at,
    });
  });

  /**
   * The body, not just the destination.
   *
   * The route's docblock promises a TARGET STATE rather than a flip — the thing
   * that keeps a double-click from re-opening a method the admin just closed.
   * Nothing asserted it: a route that sent `!body.enabled`, or a hardcoded
   * `true`, passed every case here, which is the failure mode this endpoint is
   * least able to afford.
   */
  it("forwards the requested state verbatim", async () => {
    backendRequest.mockResolvedValueOnce({ method: "email_otp", enabled: false, updated_at: "x" });

    await item.PATCH(patchRequest({ enabled: false }), params("email_otp"));

    expect(backendBody()).toEqual({ enabled: false });
  });

  it("forwards an enable the same way", async () => {
    backendRequest.mockResolvedValueOnce({ method: "email_otp", enabled: true, updated_at: "x" });

    await item.PATCH(patchRequest({ enabled: true }), params("email_otp"));

    // Pinned separately from the disable: a route that hardcoded either value
    // would still satisfy the other case.
    expect(backendBody()).toEqual({ enabled: true });
  });

  it("returns the updated element from a write, not a 204", async () => {
    backendRequest.mockResolvedValueOnce({
      method: "email_otp",
      enabled: false,
      updated_at: "2026-09-18T01:00:00.000Z",
    });

    const response = await item.PATCH(patchRequest({ enabled: false }), params("email_otp"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ method: "email_otp", enabled: false });
  });

  /**
   * An empty list is a fault — the migration seeds both rows — but the ROUTE
   * passes it through and the browser decides. A route that turned a 200 into
   * an error would be inventing something the backend never said.
   */
  it("passes an empty list through rather than judging it", async () => {
    backendRequest.mockResolvedValueOnce({ methods: [] });

    const response = await list.GET();
    const body = (await response.json()) as AuthMethodSettingsResponseDto;

    expect(response.status).toBe(200);
    expect(body.methods).toEqual([]);
  });

  /**
   * SPEC §3.1. An unknown method is a sign-in path already in force; filtering
   * it would hide it from the only person who can switch it off.
   */
  it("keeps a method this build has never heard of", async () => {
    backendRequest.mockResolvedValueOnce({
      methods: [{ method: "webauthn", enabled: true, updated_at: "2026-09-18T01:00:00.000Z" }],
    });

    const body = (await list.GET().then((r) => r.json())) as AuthMethodSettingsResponseDto;

    expect(body.methods.map((m) => m.method)).toContain("webauthn");
  });
});

describe("auth methods — a backend error stays an error", () => {
  it("does not degrade a failed read into an empty list", async () => {
    backendFails(500, { message: "boom" });

    const response = await list.GET();
    const body = await response.json();

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(body).not.toHaveProperty("methods");
  });

  it("keeps a 404 on write a 404", async () => {
    backendFails(404, { code: "not found", message: "no such built-in method" });

    const response = await item.PATCH(patchRequest({ enabled: false }), params("nope"));

    expect(response.status).toBe(404);
  });
});

describe("auth methods — the 409 refusal reaches the operator intact", () => {
  const REFUSAL =
    "at least one sign-in method must remain enabled " +
    "(no break-glass credential is configured, so this would be unrecoverable)";

  it("passes the backend's own sentence through under the literal `error` key", async () => {
    backendFails(409, { code: "last_auth_method", message: REFUSAL });

    const response = await item.PATCH(patchRequest({ enabled: false }), params("email_password"));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(409);
    // The literal key, not `BffError.message`: `routeErrorResponse` writes
    // `error` and `bffFetch` reads it, so a rename on either side must fail
    // here rather than silently blank the only sentence that tells an admin
    // whether they can recover.
    expect(body.error).toBe(REFUSAL);
    expect(String(body.error)).toContain("break-glass");
  });

  it("carries the stable code through as well", async () => {
    backendFails(409, { code: "last_auth_method", message: REFUSAL });

    const body = (await item
      .PATCH(patchRequest({ enabled: false }), params("email_password"))
      .then((r) => r.json())) as Record<string, unknown>;

    expect(body.code).toBe("last_auth_method");
  });

  /**
   * A 409 whose body has no `message` falls back to `defaultMessageForStatus`,
   * which in this repo is "Maintenance state conflict" — wording from an
   * unrelated domain. The route is not where that is repaired (the screen
   * substitutes its own copy), but the shape must be pinned, because the
   * screen's rule is written against exactly this string.
   */
  it("still answers 409 when the backend sent no message", async () => {
    backendFails(409, {});

    const response = await item.PATCH(patchRequest({ enabled: false }), params("email_password"));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(409);
    expect(body.error).toBe("Maintenance state conflict");
  });
});

describe("auth methods — the admin gate runs on the happy path", () => {
  /**
   * Positive assertions, because the negative one on the cross-origin path
   * (`not.toHaveBeenCalled`) passes just as happily when the gate is absent
   * from the route entirely. Removing `requireAdminSession()` from both
   * handlers left every other case in this file green.
   */
  it("checks the session before reading", async () => {
    backendRequest.mockResolvedValueOnce(wire);

    await list.GET();

    expect(requireAdminSession).toHaveBeenCalledTimes(1);
  });

  it("checks the session before writing", async () => {
    backendRequest.mockResolvedValueOnce(wire.methods[0]);

    await item.PATCH(patchRequest({ enabled: false }), params("email_otp"));

    expect(requireAdminSession).toHaveBeenCalledTimes(1);
  });
});

describe("auth methods — the write is guarded before it travels", () => {
  it("rejects a non-boolean `enabled` without calling the backend", async () => {
    const response = await item.PATCH(patchRequest({ enabled: "false" }), params("email_otp"));

    expect(response.status).toBe(400);
    expect(backendRequest).not.toHaveBeenCalled();
  });

  it("rejects a missing `enabled` without calling the backend", async () => {
    const response = await item.PATCH(patchRequest({}), params("email_otp"));

    expect(response.status).toBe(400);
    expect(backendRequest).not.toHaveBeenCalled();
  });

  /**
   * SPEC §3.1: the closed set is for labels. A route that validated the name
   * locally would render a row and then refuse to toggle it.
   */
  it("forwards a method name this build does not know", async () => {
    backendRequest.mockResolvedValueOnce({
      method: "webauthn",
      enabled: false,
      updated_at: "2026-09-18T01:00:00.000Z",
    });

    const response = await item.PATCH(patchRequest({ enabled: false }), params("webauthn"));

    expect(response.status).toBe(200);
    expect(backendRequest.mock.calls[0]?.[0]).toMatchObject({
      path: "/api/v1/auth/settings/webauthn",
    });
  });

  it("refuses a cross-origin write before touching the session", async () => {
    isSameOriginRequest.mockReturnValueOnce(false);

    const response = await item.PATCH(patchRequest({ enabled: false }), params("email_otp"));

    expect(response.status).toBe(403);
    expect(requireAdminSession).not.toHaveBeenCalled();
    expect(backendRequest).not.toHaveBeenCalled();
  });
});
