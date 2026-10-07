import { describe, expect, it } from "vitest";

import { resolveBackendUrl } from "@/server/backend/config";

describe("resolveBackendUrl", () => {
  it("preserves the base path prefix when the path starts with /", () => {
    expect(resolveBackendUrl("http://nginx:9000/auth", "/api/v1/me").toString()).toBe(
      "http://nginx:9000/auth/api/v1/me",
    );
  });

  it("preserves the base path prefix when the path does not start with /", () => {
    expect(resolveBackendUrl("http://nginx:9000/maintmode", "api/v1/resources").toString()).toBe(
      "http://nginx:9000/maintmode/api/v1/resources",
    );
  });

  it("handles a trailing slash on the base", () => {
    expect(resolveBackendUrl("http://nginx:9000/auth/", "/api/v1/me").toString()).toBe(
      "http://nginx:9000/auth/api/v1/me",
    );
  });

  it("preserves the query string on the path", () => {
    const url = resolveBackendUrl(
      "http://nginx:9000/maintmode",
      "/ui/v1/calendar?from=2026-05-11&to=2026-05-17",
    );
    expect(url.pathname).toBe("/maintmode/ui/v1/calendar");
    expect(url.searchParams.get("from")).toBe("2026-05-11");
    expect(url.searchParams.get("to")).toBe("2026-05-17");
  });

  it("rejects absolute URLs in the path (SSRF guard)", () => {
    expect(() => resolveBackendUrl("http://nginx:9000/auth", "http://evil.test/x")).toThrow(/absolute/);
    expect(() => resolveBackendUrl("http://nginx:9000/auth", "https://evil.test/x")).toThrow(/absolute/);
    expect(() => resolveBackendUrl("http://nginx:9000/auth", "javascript:alert(1)")).toThrow(/absolute/);
  });

  it("rejects protocol-relative paths", () => {
    expect(() => resolveBackendUrl("http://nginx:9000/auth", "//evil.test/x")).toThrow(/protocol-relative/);
  });

  it("rejects empty paths", () => {
    expect(() => resolveBackendUrl("http://nginx:9000/auth", "")).toThrow(/non-empty/);
  });

  // L-3 (security review 2026-10-07). `encodeURIComponent("..")` is `..`, so a
  // route parameter could walk the request onto a neighbouring backend route.
  it.each([
    "../maintmode/api/v1/resources",
    "/api/v1/resources/../users",
    "/api/v1/resources/./x",
    "/api/v1/resources/%2e%2e/users",
    "/api/v1/resources/.%2E/users",
    "/api/v1/resources/..",
  ])("rejects the dot segment in %s", (path) => {
    expect(() => resolveBackendUrl("http://nginx:9000/auth", path)).toThrow(/dot segments/);
  });

  it("allows dots inside a segment and in the query", () => {
    const url = resolveBackendUrl("http://nginx:9000/auth", "/api/v1/files/report.v2..csv?q=../x");
    expect(url.pathname).toBe("/auth/api/v1/files/report.v2..csv");
    expect(url.searchParams.get("q")).toBe("../x");
  });
});
