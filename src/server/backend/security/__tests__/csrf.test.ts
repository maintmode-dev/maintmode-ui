import { describe, expect, it } from "vitest";

import { isSameOriginRequest } from "../csrf";

const URL_BASE = "https://ui.test/api/sensitive";

function mkRequest(headers: Record<string, string>): Request {
  return new Request(URL_BASE, { method: "POST", headers });
}

describe("isSameOriginRequest", () => {
  it("accepts same-origin Origin header", () => {
    expect(isSameOriginRequest(mkRequest({ origin: "https://ui.test" }))).toBe(true);
  });

  it("rejects cross-origin Origin header", () => {
    expect(isSameOriginRequest(mkRequest({ origin: "https://evil.test" }))).toBe(false);
  });

  it("rejects Origin that matches host but not scheme", () => {
    expect(isSameOriginRequest(mkRequest({ origin: "http://ui.test" }))).toBe(false);
  });

  it("falls back to Referer when Origin is missing — same-origin allowed", () => {
    expect(isSameOriginRequest(mkRequest({ referer: "https://ui.test/some/page" }))).toBe(true);
  });

  it("falls back to Referer when Origin is missing — cross-origin rejected", () => {
    expect(isSameOriginRequest(mkRequest({ referer: "https://evil.test/" }))).toBe(false);
  });

  it("rejects malformed Referer (cannot be parsed)", () => {
    expect(isSameOriginRequest(mkRequest({ referer: "not a url" }))).toBe(false);
  });

  it("rejects when BOTH Origin and Referer are missing", () => {
    expect(isSameOriginRequest(mkRequest({}))).toBe(false);
  });

  it("ignores Referer when Origin is present (Origin wins, even if it mismatches)", () => {
    // Origin says cross-origin → reject, regardless of a "matching" Referer.
    expect(
      isSameOriginRequest(mkRequest({ origin: "https://evil.test", referer: "https://ui.test/page" })),
    ).toBe(false);
  });

  // Behind Caddy `reverse_proxy ui:3000`, request.url is the internal upstream
  // (http://ui:3000) while the browser sends the public Origin. The forwarded
  // headers carry the real client-facing origin.
  describe("behind a reverse proxy (X-Forwarded-*)", () => {
    const mkProxied = (headers: Record<string, string>) =>
      new Request("http://ui:3000/api/resources", { method: "POST", headers });

    it("accepts the public Origin reconstructed from X-Forwarded-Host/Proto", () => {
      expect(
        isSameOriginRequest(
          mkProxied({
            origin: "https://dev.maintmode.dev",
            "x-forwarded-host": "dev.maintmode.dev",
            "x-forwarded-proto": "https",
          }),
        ),
      ).toBe(true);
    });

    it("accepts the public Referer when Origin is absent", () => {
      expect(
        isSameOriginRequest(
          mkProxied({
            referer: "https://dev.maintmode.dev/resources",
            "x-forwarded-host": "dev.maintmode.dev",
            "x-forwarded-proto": "https",
          }),
        ),
      ).toBe(true);
    });

    it("defaults forwarded proto to https when only the host is forwarded", () => {
      expect(
        isSameOriginRequest(
          mkProxied({ origin: "https://dev.maintmode.dev", "x-forwarded-host": "dev.maintmode.dev" }),
        ),
      ).toBe(true);
    });

    it("takes the first host from a comma-separated proxy chain", () => {
      expect(
        isSameOriginRequest(
          mkProxied({
            origin: "https://dev.maintmode.dev",
            "x-forwarded-host": "dev.maintmode.dev, internal-lb",
            "x-forwarded-proto": "https, http",
          }),
        ),
      ).toBe(true);
    });

    it("still rejects a cross-origin request even with a forwarded host", () => {
      expect(
        isSameOriginRequest(
          mkProxied({
            origin: "https://evil.test",
            "x-forwarded-host": "dev.maintmode.dev",
            "x-forwarded-proto": "https",
          }),
        ),
      ).toBe(false);
    });
  });
});
