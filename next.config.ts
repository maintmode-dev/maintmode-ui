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
        // TWO reasons now, and the second one is easy to miss.
        //
        // 1. Stale HTML → ChunkLoadError. Pages used to render fully static, and
        // Next served that HTML with `Cache-Control: s-maxage=31536000`, so the
        // edge (Caddy) cached a year-old document that still referenced the JS
        // chunk hashes of the build that produced it. After the next deploy the
        // chunks are rebuilt with new hashes and the old files are gone, so the
        // stale HTML requests them and gets 404s — the page fails to hydrate
        // (ChunkLoadError). Observed on /admin/audit-log: 6 chunk 404s against a
        // year-cached document.
        //
        // 2. Per-viewer content. Since RUK-233 the root layout reads the `mm.tz`
        // cookie to render the first frame in the viewer's timezone, so a page
        // document now VARIES BY COOKIE. `no-store` is what keeps the edge from
        // handing one operator's zone to another; we deliberately do not add
        // `Vary: Cookie`, because it is redundant while nothing is cached at all.
        //
        // Consequence: do NOT relax this to a cacheable policy without first
        // solving (2). Reason 1 alone no longer describes what this guards — the
        // pages it named are dynamic now, since `cookies()` opts the whole tree
        // into dynamic rendering.
        //
        // `no-store` on the document keeps the browser/edge from ever reusing a
        // stale HTML→chunk mapping. Static assets under /_next/static keep their
        // own `immutable` year cache (their hashed names make that safe) and are
        // excluded by the negative lookahead below, as are /_next/image, /api/
        // (BFF handlers own their own cache contract), and any path ending in a
        // file extension (`.*\.[\w]+$` — covers favicon.ico and hashed assets).
        source: "/((?!_next/static|_next/image|api/|.*\\.[\\w]+$).*)",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      {
        /**
         * Baseline security headers on every response.
         *
         * `Referrer-Policy: strict-origin`, not `strict-origin-when-cross-origin`.
         *
         * Two routes carry a credential in their URL: the OAuth receiver
         * (`/auth/oauth/callback?code=…`, a 60-second one-time code) and the
         * invitation page (`/accept-invite?token=…`, a SEVEN-DAY bearer token).
         * Any subresource those documents load sends the page URL in `Referer`.
         *
         * The weaker value does not cover them, and the reason is the shipped
         * topology rather than anything subtle: prod puts the app and the auth
         * backend on ONE origin behind a path prefix
         * (`https://…` and `https://…/auth`, see deployment/prod/app.env.example).
         * `strict-origin-when-cross-origin` trims to the origin only when the
         * origin differs — for a SAME-origin request it sends the full URL,
         * query included. The root layout already preloads a font, so this is
         * not hypothetical: every asset request would put the raw token in the
         * gateway's access log, where it outlives nothing and the token stays
         * valid for a week.
         *
         * `strict-origin` sends only the origin either way. Nothing in this app
         * reads `Referer`, so the stricter value costs nothing.
         */
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
