// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BffError, bffFetch } from "../bff-fetch";

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function mockResponse(status: number, body: unknown, contentType = "application/json"): Response {
  const bodyString = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(bodyString, {
    status,
    headers: { "content-type": contentType },
  });
}

describe("bffFetch", () => {
  let fetchMock: FetchMock;
  let replaceMock: ReturnType<typeof vi.fn>;
  let originalLocation: Location;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // jsdom's `window.location` is sealed; replace the whole property
    // descriptor so we can spy on `.replace()` calls.
    originalLocation = window.location;
    replaceMock = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: {
        pathname: "/maintenance/m-1001",
        search: "?foo=bar",
        replace: replaceMock,
      } as unknown as Location,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it("parses a 200 JSON response", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, { ok: true, value: 42 }));
    const data = await bffFetch<{ ok: boolean; value: number }>("/api/test");
    expect(data).toEqual({ ok: true, value: 42 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("returns undefined on 204 No Content", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const data = await bffFetch<unknown>("/api/empty");
    expect(data).toBeUndefined();
  });

  it("throws BffError with status/code/body on 4xx JSON error", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(400, { error: "Bad request", code: "BAD_REQUEST", details: ["nope"] }),
    );
    await expect(bffFetch("/api/test")).rejects.toMatchObject({
      status: 400,
      code: "BAD_REQUEST",
      message: "Bad request",
    });
  });

  it("throws BffError on 5xx with body when JSON", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(503, { error: "Unavailable", code: "BACKEND_UNAVAILABLE" }));
    await expect(bffFetch("/api/test")).rejects.toBeInstanceOf(BffError);
  });

  it("redirects to /login on 401 AUTH_REQUIRED and the returned promise never resolves", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(401, { code: "AUTH_REQUIRED" }));
    let resolved = false;
    let rejected = false;
    void bffFetch("/api/test")
      .then(() => {
        resolved = true;
      })
      .catch(() => {
        rejected = true;
      });

    // bffFetch must observe the response, parse the JSON body, then call
    // `.replace()` — a chain whose microtask count isn't fixed (Response.json()
    // can take several turns, especially under CI load). Poll for the actual
    // redirect rather than guessing a yield count, so the test is deterministic.
    const deadline = Date.now() + 1000;
    while (replaceMock.mock.calls.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 0));
    }

    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith(
      expect.stringMatching(/^\/login\?next=%2Fmaintenance%2Fm-1001%3Ffoo%3Dbar$/),
    );
    expect(resolved).toBe(false);
    expect(rejected).toBe(false);
  });

  it("skips the 401 redirect when skipAuthRedirect=true", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(401, { code: "AUTH_REQUIRED" }));
    await expect(bffFetch("/api/test", { skipAuthRedirect: true })).rejects.toBeInstanceOf(BffError);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("does not redirect on a 401 with a different code", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(401, { code: "WHATEVER" }));
    await expect(bffFetch("/api/test")).rejects.toMatchObject({
      status: 401,
      code: "WHATEVER",
    });
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("includes JSON content-type headers by default", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, {}));
    await bffFetch("/api/test", { method: "POST", body: "{}" });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Accept: "application/json",
    });
  });
});
