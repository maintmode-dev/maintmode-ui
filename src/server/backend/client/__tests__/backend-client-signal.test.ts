import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { backendRequest } from "@/server/backend/client/backend-client";

/**
 * A caller may ask for a deadline tighter than the shared default. An earlier
 * version spread `...init` and then assigned `signal`, silently discarding it —
 * so `/login`'s 2s bound quietly became the 10s default and the page could hold
 * a blank tab open for ten seconds before rendering its break-glass form.
 *
 * This asserts the EFFECT (the request actually aborts in time), not the shape
 * of the option. The test it replaces checked `toBeInstanceOf(AbortSignal)`
 * against a mocked client, so it passed while the behaviour never worked.
 */
describe("backendRequest honours a caller-supplied signal", () => {
  beforeEach(() => {
    process.env.MAINTMODE_API_BASE_URL = "http://backend.test/maintmode";
    process.env.MAINTMODE_AUTH_API_BASE_URL = "http://backend.test/auth";
    // Deliberately far longer than the caller's bound: if the caller's signal
    // were dropped, this test would hang rather than fail fast.
    process.env.MAINTMODE_API_TIMEOUT_MS = "30000";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("aborts on the caller's deadline, not the shared default", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            // A server that accepts the connection and never answers.
            init?.signal?.addEventListener("abort", () =>
              reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
            );
          }),
      ),
    );

    const started = Date.now();
    await expect(
      backendRequest({
        path: "/api/v1/auth/providers",
        method: "GET",
        useAuthBase: true,
        signal: AbortSignal.timeout(150),
      }),
    ).rejects.toBeDefined();

    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
