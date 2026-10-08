import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Contract test — `POST /api/auth/dev-login` → backend
 * `POST /api/v1/login/oauth/exchange/google` (dev stub) + `GET /api/v1/me`.
 *
 * Dev-only: it replaces the Auth.js `/api/auth/callback/dev-bypass` endpoint
 * that headless tooling signed in through. No recorded fixture: the exchange
 * mints a user on every call and exists only on dev backends (405 in prod), so
 * the four questions are answered against a stubbed `fetch`, as for
 * `me-password.contract.test.ts`:
 *
 *   1. is the role forwarded — as `X-Test-Roles`, with the dev placeholder token?
 *   2. does success reach the client — 204 and a session cookie?
 *   3. does a backend failure stay an error rather than a silent 204?
 *   4. are expectations read off the `fetch` stub, not off the inputs?
 */

const devBypass = vi.hoisted(() => ({ enabled: true }));
vi.mock("@/server/auth/dev-bypass", () => ({
  get DEV_BYPASS_ENABLED() {
    return devBypass.enabled;
  },
}));

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: ({ name, value }: { name: string; value: string }) => {
      jar.set(name, value);
    },
  }),
  headers: async () => new Headers(),
}));

const { POST } = await import("@/app/api/auth/dev-login/route");

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  devBypass.enabled = true;
  jar.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("MAINTMODE_AUTH_SECRET", "a".repeat(32));
  vi.stubEnv("MAINTMODE_APP_BASE_URL", "http://localhost:3000");
  vi.stubEnv("MAINTMODE_AUTH_PUBLIC_BASE_URL", "http://localhost:9000/auth");
  vi.stubEnv("MAINTMODE_AUTH_API_BASE_URL", "http://backend.test/auth");
  vi.stubEnv("MAINTMODE_API_BASE_URL", "http://backend.test/maintmode");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function backendSignsIn() {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/exchange/google")) {
      return Response.json({ access_token: "at", refresh_token: "rt", expires_in: 900 });
    }
    return Response.json({ id: "u-1", email: "dev@example.test", display_name: "Dev", roles: ["admin"] });
  });
}

const post = (role: string, origin?: string) =>
  new Request("http://localhost:3000/api/auth/dev-login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...(origin ? { origin } : {}) },
    body: new URLSearchParams({ role }),
  });

describe("POST /api/auth/dev-login", () => {
  it("forwards the role as X-Test-Roles with the dev placeholder token", async () => {
    backendSignsIn();

    await POST(post("reviewer"));

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://backend.test/auth/api/v1/login/oauth/exchange/google");
    expect(new Headers(init?.headers).get("x-test-roles")).toBe("reviewer");
    expect(JSON.parse(String(init?.body))).toEqual({ id_token: "dev-bypass" });
  });

  it("answers 204 and leaves a session cookie behind", async () => {
    backendSignsIn();

    const response = await POST(post("admin"));

    expect(response.status).toBe(204);
    expect(jar.get("authjs.session-token")).toBeTruthy();
  });

  it("keeps a backend failure an error, with no session", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));

    const response = await POST(post("admin"));

    expect(response.status).toBe(502);
    expect(jar.size).toBe(0);
  });

  it("does not exist when the bypass is off", async () => {
    devBypass.enabled = false;

    expect((await POST(post("admin"))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // A browser posting from another site always sends Origin; a script sends none.
  it("refuses a foreign Origin and rejects an unknown role before the backend", async () => {
    expect((await POST(post("admin", "https://evil.example"))).status).toBe(403);
    expect((await POST(post("root"))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
