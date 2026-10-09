import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loginWithBreakGlass, refreshBackendToken } from "@/server/auth/backend-token-exchange";
import { backendRequest } from "@/server/backend/client/backend-client";

/**
 * Every server-side backend call carries the browser's X-Forwarded-For and
 * User-Agent exactly as they reached this server. Without them the backend's
 * per-IP sign-in limit sees one address — this container's — and is a single
 * bucket for all users, and every audit row and session record names this
 * container and Node's own User-Agent instead of the person's browser.
 *
 * Covered at the two `fetch` sites themselves (`backendRequest` and the auth
 * module's `backendFetch`, reached through its public calls) rather than at the
 * helper, so a wrapper that stops calling the helper fails here.
 */

const incoming = new Headers();
let outsideRequestScope = false;

vi.mock("next/headers", () => ({
  headers: async () => {
    if (outsideRequestScope) {
      throw new Error("`headers` was called outside a request scope.");
    }
    return incoming;
  },
}));

const TOKEN_PAIR = { access_token: "access-2", refresh_token: "refresh-2", expires_in: 900 };

// An edge proxy's value after one more trusted hop: the client, then the proxy.
const CHAIN = "203.0.113.7, 10.0.4.2";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const fetchMock = vi.fn<typeof fetch>(async () => Response.json(TOKEN_PAIR));

function sentHeaders(): Headers {
  return new Headers(fetchMock.mock.calls.at(-1)?.[1]?.headers);
}

beforeEach(() => {
  process.env.MAINTMODE_API_BASE_URL = "http://backend.test/maintmode";
  process.env.MAINTMODE_AUTH_API_BASE_URL = "http://backend.test/auth";
  for (const name of [...incoming.keys()]) incoming.delete(name);
  outsideRequestScope = false;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const calls = [
  ["backendRequest", () => backendRequest({ path: "/api/v1/auth/providers", useAuthBase: true })],
  ["sign-in (break-glass)", () => loginWithBreakGlass("recovery-password")],
  ["refresh", () => refreshBackendToken("refresh-1")],
] as const;

describe.each(calls)("%s", (_name, call) => {
  it("forwards the incoming X-Forwarded-For verbatim", async () => {
    incoming.set("x-forwarded-for", CHAIN);

    await call();

    // Whole chain, unchanged: not trimmed to the first entry, not extended
    // with this server's address — that is the next hop's job.
    expect(sentHeaders().get("x-forwarded-for")).toBe(CHAIN);
  });

  it("forwards the incoming User-Agent verbatim", async () => {
    incoming.set("user-agent", BROWSER_UA);

    await call();

    expect(sentHeaders().get("user-agent")).toBe(BROWSER_UA);
  });

  it("sends neither header when none came in", async () => {
    await call();

    // Nothing synthesised in their place: no address of this server, and no
    // User-Agent of our own choosing standing in for the browser's.
    expect(sentHeaders().has("x-forwarded-for")).toBe(false);
    expect(sentHeaders().has("user-agent")).toBe(false);
  });

  it("still calls the backend outside a request scope, without either header", async () => {
    outsideRequestScope = true;

    await call();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentHeaders().has("x-forwarded-for")).toBe(false);
    expect(sentHeaders().has("user-agent")).toBe(false);
  });
});

describe("forwarding leaves the rest of the request alone", () => {
  // The refresh call must still carry its token and JSON contract, and parse
  // the rotated pair, whatever client headers ride along.
  it("refresh keeps its body, content type and result", async () => {
    incoming.set("x-forwarded-for", CHAIN);
    incoming.set("user-agent", BROWSER_UA);

    const pair = await refreshBackendToken("refresh-1");

    const init = fetchMock.mock.calls.at(-1)?.[1];
    expect(JSON.parse(String(init?.body))).toEqual({ refresh_token: "refresh-1" });
    expect(sentHeaders().get("content-type")).toBe("application/json");
    expect(pair).toMatchObject({ access_token: "access-2", refresh_token: "refresh-2" });
  });

  it("backendRequest keeps the bearer token", async () => {
    incoming.set("x-forwarded-for", CHAIN);

    await backendRequest({ path: "/api/v1/maintenances", accessToken: "access-1" });

    expect(sentHeaders().get("authorization")).toBe("Bearer access-1");
  });

  it("forwards nothing but X-Forwarded-For and User-Agent from the browser", async () => {
    incoming.set("x-forwarded-for", CHAIN);
    incoming.set("user-agent", BROWSER_UA);
    incoming.set("x-real-ip", "198.51.100.9");
    incoming.set("cookie", "session=secret");
    incoming.set("accept-language", "de-DE");

    await backendRequest({ path: "/api/v1/maintenances", accessToken: "access-1" });

    expect(sentHeaders().has("x-real-ip")).toBe(false);
    expect(sentHeaders().has("cookie")).toBe(false);
    expect(sentHeaders().has("accept-language")).toBe(false);
  });
});
