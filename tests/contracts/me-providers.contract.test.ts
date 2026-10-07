import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createBackendMock, readWireFixture } from "./_harness";

import { BackendRequestError } from "@/server/backend/errors/backend-request-error";

/**
 * Contract tests — the three BFF routes behind the profile's "Sign-in methods"
 * card (GAP-2, v0.2.0-rc): the list of providers an account can link, starting
 * a link, and removing one.
 *
 * ## The case that justifies this file
 *
 * Connect answers with a RELATIVE `link_url` into the auth backend's `/start`,
 * carrying a ticket that attaches a sign-in method to this account. The route
 * makes it absolute against the BROWSER-reachable auth base and refuses
 * anything that is not a plain path — so the two assertions that matter most
 * are that the path and its ticket arrive intact on the right origin, and that a
 * foreign or protocol-relative URL never reaches the browser to be navigated to.
 *
 * The connect fixture is transcribed and masked (see the manifest): the
 * recorder captures GET 200s only, and the body is a secret. Error bodies are
 * constructed in-test, as in every contract test here.
 */

const connectWire = readWireFixture<{ link_url: string }>("me-provider-connect.json");
const providersWire = readWireFixture<{ methods: unknown[] }>("auth-providers.json");

const authedRequest = createBackendMock<unknown>();
vi.mock("@/server/backend/client/authenticated-backend-request", () => ({
  authenticatedBackendRequest: (opts: unknown) => authedRequest(opts as { path: string }),
}));

const publicRequest = createBackendMock<unknown>();
vi.mock("@/server/backend/client/backend-client", () => ({
  backendRequest: (opts: unknown) => publicRequest(opts as { path: string }),
}));

const isSameOriginRequest = vi.fn<(request: Request) => boolean>(() => true);
vi.mock("@/server/backend/security/csrf", () => ({
  isSameOriginRequest: (request: Request) => isSameOriginRequest(request),
}));

// The binding cookie is written through `cookies()`, which needs a request
// scope this test does not have; what the contract cares about is that a fresh
// binding is minted and lands on the link.
const mintOAuthBinding = vi.fn(async () => "BINDING-HASH");
vi.mock("@/server/auth/oauth-binding-cookie", () => ({ mintOAuthBinding: () => mintOAuthBinding() }));

const list = await import("@/app/api/sign-in-methods/route");
const connect = await import("@/app/api/me/providers/[provider]/connect/route");
const item = await import("@/app/api/me/providers/[provider]/route");

beforeEach(() => {
  isSameOriginRequest.mockClear();
  isSameOriginRequest.mockReturnValue(true);
  vi.stubEnv("MAINTMODE_AUTH_SECRET", "a".repeat(32));
  vi.stubEnv("MAINTMODE_APP_BASE_URL", "http://localhost:3000");
  vi.stubEnv("MAINTMODE_AUTH_PUBLIC_BASE_URL", "https://maintmode.example/auth");
});

afterEach(() => vi.unstubAllEnvs());

const params = (provider: string) => ({ params: Promise.resolve({ provider }) });
const post = () => new Request("http://localhost/api/me/providers/github/connect", { method: "POST" });
const del = () => new Request("http://localhost/api/me/providers/github", { method: "DELETE" });

function backendFails(mock: typeof authedRequest, status: number, body: unknown) {
  mock.mockRejectedValueOnce(new BackendRequestError(status, JSON.stringify(body)));
}

describe("GET /api/sign-in-methods — the list the card offers", () => {
  it("asks the AUTH base for the public providers list, uncached", async () => {
    publicRequest.mockResolvedValueOnce(providersWire);

    await list.GET();

    expect(publicRequest.mock.calls[0]?.[0]).toMatchObject({
      path: "/api/v1/auth/providers",
      method: "GET",
      useAuthBase: true,
      cache: "no-store",
    });
  });

  it("passes the recorded list through as it stands", async () => {
    publicRequest.mockResolvedValueOnce(providersWire);

    const response = await list.GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(providersWire);
  });

  it("keeps a backend failure a failure, never an empty list", async () => {
    // An empty list would read as "nothing to connect" — a statement about the
    // instance the backend never made.
    backendFails(publicRequest, 503, { code: "unavailable", message: "down" });

    const response = await list.GET();

    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty("methods");
  });
});

describe("POST /api/me/providers/{p}/connect — starting a link", () => {
  it("asks the AUTH base to run the dance for the named provider, escaped", async () => {
    authedRequest.mockResolvedValueOnce(connectWire);

    await connect.POST(post(), params("git hub/x"));

    const opts = authedRequest.mock.calls[0]?.[0] as {
      path: string;
      method: string;
      useAuthBase: boolean;
      body: string;
    };
    expect(opts).toMatchObject({
      path: "/api/v1/me/providers/git%20hub%2Fx/connect",
      method: "POST",
      useAuthBase: true,
    });
    // Dance mode, and nothing else: the id_token mode needs a token this app
    // no longer has, and a body naming both is refused by the backend.
    expect(JSON.parse(opts.body)).toEqual({ mode: "dance" });
  });

  it("answers the link on the browser-reachable auth origin, path and ticket intact", async () => {
    authedRequest.mockResolvedValueOnce(connectWire);

    const response = await connect.POST(post(), params("github"));

    expect(response.status).toBe(200);
    // Backend M1: the link carries this browser's binding next to its ticket,
    // so the link code it yields completes only from here.
    expect(await response.json()).toEqual({
      url: "https://maintmode.example/auth/api/v1/login/oauth/github/start?link=<link-ticket>&binding=BINDING-HASH",
    });
  });

  it("mints no binding for a link it refuses to hand out", async () => {
    mintOAuthBinding.mockClear();
    authedRequest.mockResolvedValueOnce({ link_url: "//evil.example/start?link=t" });

    await connect.POST(post(), params("github"));

    expect(mintOAuthBinding).not.toHaveBeenCalled();
  });

  it.each([
    ["an absolute URL", "https://evil.example/api/v1/login/oauth/github/start?link=t"],
    ["a protocol-relative URL", "//evil.example/start?link=t"],
    ["a missing link", undefined],
  ])("refuses to hand the browser %s", async (_label, linkUrl) => {
    authedRequest.mockResolvedValueOnce({ link_url: linkUrl });

    const response = await connect.POST(post(), params("github"));

    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("evil.example");
  });

  it("keeps a 409 an error, with the backend's code intact", async () => {
    // Passed through like every error here. The backend's MESSAGE tells "already
    // yours" from "someone else's" (BE note on GAP-2), so the card must branch on
    // the status/code and never render the message — pinned in the card's test,
    // since this route's job is only not to lose the status.
    backendFails(authedRequest, 409, { code: "conflict", message: "provider is linked to another user" });

    const response = await connect.POST(post(), params("github"));

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("conflict");
  });

  it("refuses a cross-origin request before any work", async () => {
    isSameOriginRequest.mockReturnValueOnce(false);

    const response = await connect.POST(post(), params("github"));

    expect(response.status).toBe(403);
    expect(authedRequest).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/me/providers/{p} — removing a link", () => {
  it("asks the AUTH base to disconnect the named provider", async () => {
    authedRequest.mockResolvedValueOnce(undefined);

    const response = await item.DELETE(del(), params("github"));

    expect(response.status).toBe(204);
    expect(authedRequest.mock.calls[0]?.[0]).toMatchObject({
      path: "/api/v1/me/providers/github/disconnect",
      method: "DELETE",
      useAuthBase: true,
    });
  });

  it("escapes the provider, so a slash in a crafted id stays inside one segment", async () => {
    // Connect's escaping is pinned above; this is the route that REMOVES a way
    // in. Unescaped, `../../x` would resolve against the backend's path and
    // send the DELETE somewhere other than this account's provider link.
    authedRequest.mockResolvedValueOnce(undefined);

    await item.DELETE(del(), params("../../admin/x"));

    expect(authedRequest.mock.calls[0]?.[0]).toMatchObject({
      path: "/api/v1/me/providers/..%2F..%2Fadmin%2Fx/disconnect",
    });
  });

  /**
   * `encodeURIComponent` leaves `.` and `..` as they are, and a URL resolver
   * then reads them as dot segments: `/me/providers/../disconnect` becomes
   * `/me/disconnect`. Both provider routes refuse them before any call.
   */
  it.each([".", ".."])("refuses %s as a provider name on both routes, before any call", async (name) => {
    const disconnect = await item.DELETE(del(), params(name));
    const link = await connect.POST(post(), params(name));

    expect(disconnect.status).toBe(400);
    expect(link.status).toBe(400);
    expect(authedRequest).not.toHaveBeenCalled();
  });

  it("keeps the backend's lockout refusal an error, never a 204", async () => {
    // A swallowed 400 would have the card report a provider removed that is
    // still the account's only way in.
    backendFails(authedRequest, 400, {
      code: "invalid request",
      message: "cannot disconnect the only sign-in method",
    });

    const response = await item.DELETE(del(), params("github"));

    expect(response.status).toBe(400);
  });

  it("refuses a cross-origin request before any work", async () => {
    isSameOriginRequest.mockReturnValueOnce(false);

    const response = await item.DELETE(del(), params("github"));

    expect(response.status).toBe(403);
    expect(authedRequest).not.toHaveBeenCalled();
  });
});
