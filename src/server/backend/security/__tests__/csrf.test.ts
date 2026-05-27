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
});
