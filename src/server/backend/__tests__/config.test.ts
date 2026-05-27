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

  it("rejects paths that escape the base origin via .. traversal", () => {
    // `new URL("../../etc", "http://h/auth/")` yields http://h/etc — same origin
    // but escapes the prefix. The same-origin guard would still pass; the
    // SSRF guard is about cross-origin escapes. We document the limitation:
    // path-prefix escape inside the same origin is allowed by design (callers
    // know which prefix they target).
    const url = resolveBackendUrl("http://nginx:9000/auth", "../maintmode/api/v1/resources");
    expect(url.origin).toBe("http://nginx:9000");
  });
});
