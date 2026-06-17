import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Emit a self-contained server bundle (.next/standalone) so the production
  // Docker image can run on a minimal node:slim base without node_modules.
  // See deployment/.build/Dockerfile.
  output: "standalone",

  async headers() {
    return [
      {
        // Force page HTML documents to be uncacheable.
        //
        // Every page here is auth-gated in `proxy.ts` and renders fully static
        // (the user comes from a client `useMeQuery`, so no page touches
        // `cookies()`/`headers()` and Next prerenders the HTML as static). Next
        // then serves that HTML with `Cache-Control: s-maxage=31536000`, so the
        // edge (Caddy) caches a year-old document that still references the JS
        // chunk hashes of the build that produced it. After the next deploy the
        // chunks are rebuilt with new hashes and the old files are gone, so the
        // stale HTML requests them and gets 404s — the page fails to hydrate
        // (ChunkLoadError). Observed on /admin/audit-log: 6 chunk 404s against a
        // year-cached document.
        //
        // `no-store` on the document keeps the browser/edge from ever reusing a
        // stale HTML→chunk mapping. Static assets under /_next/static keep their
        // own `immutable` year cache (their hashed names make that safe) and are
        // excluded by the negative lookahead below, as are /_next/image, /api
        // (BFF handlers own their own cache contract), and hashed static files.
        source: "/((?!_next/static|_next/image|api/|favicon.ico|.*\\.[\\w]+$).*)",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
