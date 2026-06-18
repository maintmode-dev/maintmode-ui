import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isSameOriginRequest } from "../csrf";

const URL_BASE = "https://ui.test/api/sensitive";

function mkRequest(headers: Record<string, string>): Request {
  return new Request(URL_BASE, { method: "POST", headers });
}

describe("isSameOriginRequest", () => {
  // The base cases below assume no configured public origin, so the check
  // derives its allow-list from request.url + forwarded headers only.
  const savedBaseUrl = process.env.MAINTMODE_APP_BASE_URL;
  beforeEach(() => {
    delete process.env.MAINTMODE_APP_BASE_URL;
  });
  afterEach(() => {
    if (savedBaseUrl === undefined) delete process.env.MAINTMODE_APP_BASE_URL;
    else process.env.MAINTMODE_APP_BASE_URL = savedBaseUrl;
  });

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

    it("ignores a blank X-Forwarded-Host and falls back to the direct origin", () => {
      // Blank forwarded host must NOT produce a bare `https://` allow entry.
      expect(isSameOriginRequest(mkProxied({ origin: "http://ui:3000", "x-forwarded-host": "   " }))).toBe(
        true,
      );
      expect(isSameOriginRequest(mkProxied({ origin: "https://evil.test", "x-forwarded-host": "   " }))).toBe(
        false,
      );
    });

    it("rejects a forwarded same-host request whose Origin scheme is http", () => {
      // proto defaults to https, so an http Origin for the same host mismatches.
      expect(
        isSameOriginRequest(
          mkProxied({ origin: "http://dev.maintmode.dev", "x-forwarded-host": "dev.maintmode.dev" }),
        ),
      ).toBe(false);
    });

    it("normalizes an uppercase X-Forwarded-Proto to a valid scheme", () => {
      expect(
        isSameOriginRequest(
          mkProxied({
            origin: "https://dev.maintmode.dev",
            "x-forwarded-host": "dev.maintmode.dev",
            "x-forwarded-proto": "HTTPS",
          }),
        ),
      ).toBe(true);
    });
  });

  // The configured public origin (MAINTMODE_APP_BASE_URL) is the authoritative
  // allow value — it comes from server config, not request headers, so the
  // check no longer depends on the edge stripping client X-Forwarded-* headers.
  describe("with a configured public origin (MAINTMODE_APP_BASE_URL)", () => {
    const mkInternal = (headers: Record<string, string>) =>
      new Request("http://ui:3000/api/resources", { method: "POST", headers });

    beforeEach(() => {
      process.env.MAINTMODE_APP_BASE_URL = "https://dev.maintmode.dev";
    });

    it("accepts the public Origin even with NO forwarded headers", () => {
      // This is the case the topological fallback could not cover: the configured
      // origin is trusted directly, no X-Forwarded-Host needed.
      expect(isSameOriginRequest(mkInternal({ origin: "https://dev.maintmode.dev" }))).toBe(true);
    });

    it("still rejects a hostile Origin that a spoofed forwarded host tries to whitelist", () => {
      // Even if an attacker could inject X-Forwarded-Host=evil.test, the browser
      // sends the victim's real Origin — which is never evil.test. And a hostile
      // Origin is rejected regardless of the forwarded host.
      expect(
        isSameOriginRequest(mkInternal({ origin: "https://evil.test", "x-forwarded-host": "evil.test" })),
      ).toBe(false);
    });

    it("ignores a malformed MAINTMODE_APP_BASE_URL (falls back to other origins)", () => {
      process.env.MAINTMODE_APP_BASE_URL = "not a url";
      expect(isSameOriginRequest(mkInternal({ origin: "http://ui:3000" }))).toBe(true);
      expect(isSameOriginRequest(mkInternal({ origin: "https://dev.maintmode.dev" }))).toBe(false);
    });
  });
});
