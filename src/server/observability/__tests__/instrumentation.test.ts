import { afterEach, describe, expect, it, vi } from "vitest";

import { onRequestError } from "@/instrumentation";

type Args = Parameters<typeof onRequestError>;

function logged(path: string): Record<string, unknown> {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  void onRequestError(
    new Error("render failed"),
    { path, method: "GET", headers: {} } as Args[1],
    { routerKind: "App Router", routePath: "/accept-invite", routeType: "render" } as Args[2],
  );
  return JSON.parse(String(log.mock.calls[0][0]));
}

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * I-2 (security review 2026-10-07). Some query strings here are credentials —
 * an invitation bearer, a one-time OAuth code — and must not reach the logs.
 */
describe("onRequestError", () => {
  it("logs the path without its query string", () => {
    const entry = logged("/accept-invite?token=invitation-bearer-secret");

    expect(entry.path).toBe("/accept-invite");
    expect(JSON.stringify(entry)).not.toContain("invitation-bearer-secret");
  });

  it("logs a path without a query unchanged", () => {
    expect(logged("/calendar").path).toBe("/calendar");
  });
});
