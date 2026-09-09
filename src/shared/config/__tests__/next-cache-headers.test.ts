import { describe, expect, it } from "vitest";

import nextConfig from "../../../../next.config";

/**
 * Regression guard for the cache-header rule in next.config.ts.
 *
 * The fix (commit fix(cache)) forces `Cache-Control: no-store` on page HTML
 * documents while keeping the immutable year-cache on /_next/static assets. The
 * partition lives in a single negative-lookahead `source` regex, which is
 * exactly the kind of static config that regresses silently — and the bug it
 * fixes (ChunkLoadError from year-cached stale HTML) is invisible until the
 * next deploy. This test pins the route classification so a regex change can't
 * silently re-cache pages or stop caching assets.
 */

async function noStoreSource(): Promise<string> {
  const rules = await nextConfig.headers!();
  const rule = rules.find((r) =>
    r.headers.some((h) => h.key === "Cache-Control" && h.value.includes("no-store")),
  );
  if (!rule) throw new Error("no-store cache-header rule not found in next.config");
  return rule.source;
}

// Anchor the matcher the way Next/path-to-regexp does for a full-path `source`:
// the whole pathname must match. The source is `/(<negative-lookahead>.*)`, so
// a path is matched (→ no-store) iff it does NOT start with an excluded prefix
// or end in a file extension.
function matches(source: string, pathname: string): boolean {
  return new RegExp(`^${source}$`).test(pathname);
}

describe("next.config cache-header rule", () => {
  it("forces no-store on page document routes", async () => {
    const source = await noStoreSource();
    // `/auth/oauth/callback` (RUK-292) renders a page holding a live one-time
    // code. It needs `no-store` more than any other route here, and it gets it
    // from this rule rather than from a header of its own — pinned so a future
    // narrowing of the pattern cannot quietly exclude it.
    for (const path of [
      "/",
      "/admin/audit-log",
      "/maintenance/abc-123/audit",
      "/login",
      "/resources",
      "/auth/oauth/callback",
    ]) {
      expect(matches(source, path), `${path} should be no-store`).toBe(true);
    }
  });

  it("excludes static assets, image, api, and extensioned files (they keep their own cache)", async () => {
    const source = await noStoreSource();
    for (const path of [
      "/_next/static/chunks/abc123.js",
      "/_next/static/css/app.css",
      "/_next/image",
      "/api/resources",
      "/api/audit",
      "/favicon.ico",
      "/logo.svg",
    ]) {
      expect(matches(source, path), `${path} should be excluded from no-store`).toBe(false);
    }
  });
  /**
   * RUK-292. `Referrer-Policy` matters most for `/auth/oauth/callback`, whose
   * URL carries a live one-time code: any same-origin subresource that page
   * loads would otherwise send the whole URL in `Referer`. It is declared here,
   * for every route, rather than on that one page — the guarantee should not
   * depend on nobody adding a font or a beacon to the root layout later.
   */
  it("sets baseline security headers on every route", async () => {
    const { default: config } = (await import("../../../../next.config")) as {
      default: { headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]> };
    };
    const rules = await config.headers();
    const keys = rules.flatMap((r) => r.headers.map((h) => h.key));

    expect(keys).toContain("Referrer-Policy");
    // The VALUE, not just the presence. `strict-origin-when-cross-origin` was
    // here first and does not cover this app: prod serves the frontend and the
    // auth backend from one origin behind a path prefix, and for a SAME-origin
    // request that value sends the full URL — query string included. Two routes
    // carry a credential in their query (`?code=` on the OAuth receiver,
    // `?token=` on the invitation page), and the root layout preloads a font, so
    // every asset request would have carried the credential in `Referer`.
    const referrer = rules.flatMap((r) => r.headers).find((h) => h.key === "Referrer-Policy");
    expect(referrer?.value).toBe("strict-origin");
    expect(keys).toContain("X-Content-Type-Options");
    expect(keys).toContain("X-Frame-Options");
  });
});
