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
    for (const path of ["/", "/admin/audit-log", "/maintenance/abc-123/audit", "/login", "/resources"]) {
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
});
