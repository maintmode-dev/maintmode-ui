import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Contract test — `POST /api/admin/integrations/{kind}/test` →
 * `POST /api/v1/integrations/email/test`. RUK-290, SPEC §4.1.
 *
 * **The response shapes are recorded, not written here.** They live in
 * `tests/fixtures/wire/integration-email-test.json`, captured from a locally
 * built backend. That matters more than usual for this route: three of its four
 * interesting shapes are failures, and a failure envelope invented by the person
 * writing the test encodes that person's belief about the backend rather than
 * the backend. `scripts/refresh-fixtures.mjs` could not capture them — it issues
 * GET only and refuses non-2xx — so they were taken by hand off the wire and the
 * file records how.
 *
 * **What this route must not do**, and what each case below is standing guard
 * over:
 *
 *  - It must not turn a 502 into anything that reads like success. The probe
 *    exists to tell an operator their SMTP is broken; a route that swallowed the
 *    failure would report a working configuration for a server that refused the
 *    connection.
 *  - It must not reshape the body. The endpoint's whole purpose is to test *what
 *    the operator is looking at*, so a route that normalised or defaulted fields
 *    on the way through would test something else and report on that instead.
 *  - It must not lose the 204. An empty 204 is the only success signal there is;
 *    rewriting it as a 200 with a body would invent a payload.
 */

const wire = JSON.parse(
  readFileSync(join(process.cwd(), "tests/fixtures/wire/integration-email-test.json"), "utf8"),
) as {
  success: { status: number };
  probe_failed: { status: number; body: { code: string; message: string } };
  validation_tls_none_with_username: { status: number; body: { code: string; message: string } };
};

const readActiveSession = vi.fn();
vi.mock("@/server/auth/session-token", () => ({
  readActiveSession: () => readActiveSession(),
}));
vi.mock("@/server/backend/security/csrf", () => ({ isSameOriginRequest: () => true }));

const requireAdminSession = vi.fn();
vi.mock("@/server/auth/require-admin", () => ({
  requireAdminSession: () => requireAdminSession(),
}));

const backendRequest = vi.fn();
vi.mock("@/server/backend/client/authenticated-backend-request", () => ({
  authenticatedBackendRequest: (opts: unknown) => backendRequest(opts),
}));

const { POST } = await import("@/app/api/admin/integrations/[kind]/test/route");

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminSession.mockResolvedValue(undefined);
  readActiveSession.mockResolvedValue({ accessToken: "access-1" });
  backendRequest.mockResolvedValue(undefined);
});

/** A body shaped the way the dialog builds one. */
const BODY = {
  config: { host: "smtp.example.test", port: 587, from: "noreply@example.test" },
  secrets: { password: "hunter2" },
  to: "admin@example.test",
};

function post(body: unknown, kind = "email") {
  return POST(
    new Request(`https://app.test/api/admin/integrations/${kind}/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ kind }) },
  );
}

/** What actually went to the backend, read from the mock rather than the input. */
function wireRequest() {
  const [opts] = backendRequest.mock.calls[0] as [{ path: string; method: string; body: string }];
  return { ...opts, parsed: JSON.parse(opts.body) as Record<string, unknown> };
}

describe("test-send — the request reaches the backend intact", () => {
  it("posts to the backend's test path", async () => {
    await post(BODY);

    const { path, method } = wireRequest();
    expect(path).toBe("/api/v1/integrations/email/test");
    expect(method).toBe("POST");
  });

  it("forwards config, secrets and recipient unchanged", async () => {
    await post(BODY);

    // Verbatim on purpose: the operator is testing what is on their screen, so
    // anything reshaped here would probe a different server than the one shown.
    expect(wireRequest().parsed).toEqual(BODY);
  });

  it("keeps an omitted password omitted rather than sending an empty one", async () => {
    // `""` is a 400 on the backend and is NOT the same as "no password" — an
    // empty form field must not quietly become an anonymous-relay test.
    await post({ config: { host: "relay.internal" }, secrets: {}, to: "admin@example.test" });

    expect(wireRequest().parsed.secrets).toEqual({});
  });
});

describe("test-send — the answer reaches the client intact", () => {
  it("passes a success through as an empty 204", async () => {
    const response = await post(BODY);

    expect(response.status).toBe(wire.success.status);
    expect(await response.text()).toBe("");
  });

  it("keeps a failed probe a failure instead of degrading into success", async () => {
    // The case the button exists for. A route that reported success here would
    // tell an operator their broken SMTP works.
    const error = Object.assign(new Error("probe failed"), {
      status: wire.probe_failed.status,
      responseBody: JSON.stringify(wire.probe_failed.body),
    });
    backendRequest.mockRejectedValue(error);

    const response = await post(BODY);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).not.toBe(204);
  });

  it("keeps a validation rejection a failure too", async () => {
    const error = Object.assign(new Error("invalid request"), {
      status: wire.validation_tls_none_with_username.status,
      responseBody: JSON.stringify(wire.validation_tls_none_with_username.body),
    });
    backendRequest.mockRejectedValue(error);

    const response = await post(BODY);

    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

describe("test-send — guards", () => {
  it("refuses a kind that has no live probe", async () => {
    // Slack and Telegram have no equivalent endpoint; reaching the backend with
    // one would be a 404 there rather than a clear answer here.
    const response = await post(BODY, "slack");

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(backendRequest).not.toHaveBeenCalled();
  });

  it("refuses an unknown kind before touching the backend", async () => {
    const response = await post(BODY, "carrier-pigeon");

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(backendRequest).not.toHaveBeenCalled();
  });

  it("requires a recipient, since the backend infers none from the token", async () => {
    const response = await post({ config: {}, secrets: {}, to: "" });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(backendRequest).not.toHaveBeenCalled();
  });

  it("requires an admin session", async () => {
    requireAdminSession.mockRejectedValue(
      Object.assign(new Error("forbidden"), { status: 403, responseBody: "{}" }),
    );

    const response = await post(BODY);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(backendRequest).not.toHaveBeenCalled();
  });
});
