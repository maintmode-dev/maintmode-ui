import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeInitScript } from "./theme-provider";
import { TzInitScript } from "@/features/_shared/timezone/timezone-provider";
import { DEV_BYPASS_ENABLED } from "@/server/auth/auth-config";
import { devLoginAsAction } from "@/server/auth/auth-actions";
import "./globals.css";

export const metadata: Metadata = {
  title: "Maintmode",
  description: "Maintenance operations frontend",
};

/**
 * Document shell only. The provider stack is split one level down, by route
 * group, so the two public routes stop paying for the authenticated app:
 *
 *   (public)/layout.tsx → ThemeProvider only        [/login, /accept-invite]
 *   (app)/layout.tsx    → cookies() + AppProviders  [every other route]
 *
 * `/suspended` is deliberately in `(app)`, not `(public)`: it is reached only
 * via a 403 `organization_suspended` from a browser that HAS a live session
 * (`bff-fetch.ts`), so it is an authenticated route without chrome. It is
 * likewise absent from `PUBLIC_PREFIXES`, and the two must NOT be "reconciled":
 * the directory answers "which providers does this route need", while
 * `PUBLIC_PREFIXES` answers "is this route reachable without a session".
 *
 * This is a payload win, not a rendering-mode one — both public routes await
 * `searchParams`, itself a dynamic API, so they stay dynamic either way.
 */
export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Dev-only floating "Login as {role}" toolbar, available on every screen.
  //
  // The inline `process.env.NODE_ENV` check MUST stay here and come first: Next
  // statically inlines NODE_ENV at build time, so in any `next build` output the
  // whole branch is dead code and the dynamically imported component is dropped
  // from the bundle — including the browser-reachable /_next/static client
  // chunks. This is the standard Next.js devtools pattern; a condition imported
  // from another module is NOT tree-shaken (vercel/next.js#92082), which is why
  // `DEV_BYPASS_ENABLED` alone would leave the chunk in production images. The
  // runtime `DEV_BYPASS_ENABLED` check then keeps availability in `next dev`
  // identical to the dev-bypass provider it drives (MAINTMODE_DEV_AUTH_BYPASS).
  let devToolbar: ReactNode = null;
  if (process.env.NODE_ENV !== "production" && DEV_BYPASS_ENABLED) {
    const { DevLoginAs } = await import("@/features/auth/dev-login-as");
    devToolbar = <DevLoginAs loginAsAction={devLoginAsAction} />;
  }

  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Roman face, preloaded. Without this the font is discovered only
            after the CSS that declares `@font-face` has been fetched AND
            parsed, so with `font-display: swap` every cold load paints
            fallback text first and reflows — a guaranteed FOUT.

            The `href` MUST stay byte-identical to the `src` URL in
            globals.css: the preload cache is keyed on the resolved URL, so any
            divergence (even a query string) buys a second, wasted download
            plus a "preloaded but not used" console warning.

            `crossOrigin` is mandatory even though the file is same-origin.
            Fonts are always fetched in CORS mode, and a preload without it is
            treated as a DIFFERENT request than the one `@font-face` makes —
            again two downloads. React renders the bare attribute for `""`.

            Only the roman face is preloaded. The italic face is used on a
            single placeholder in `/approvals`; preloading it would cost every
            visitor ~100 KB to save one screen a lazy fetch. */}
        <link rel="preload" href="/fonts/InterVariable.woff2" as="font" type="font/woff2" crossOrigin="" />
        {/* Both init scripts stay HERE, in the root, and must not be pushed
            down into the route groups.

            ThemeInitScript has to run in `<head>` before first paint, and only
            the root layout renders `<head>` — from a group layout it would land
            in `<body>`, i.e. after paint, giving a theme flash on every route.

            TzInitScript looks out of place on `/login`, which renders no times
            at all, but that is exactly where it does its job: it seeds `mm.tz`
            on a FIRST visit so the NEXT full load is server-rendered in the
            viewer's zone (it cannot fix the current frame — see its docblock).
            For most users the first page ever loaded is `/login`. Move it into
            `(app)` and the cookie is only seeded after sign-in, so the first
            authenticated frame renders in UTC — a partial RUK-233 regression
            that no test catches and only new users ever see. The cost of
            keeping it is one ~200-byte inline script, no chunk. */}
        <ThemeInitScript />
        <TzInitScript />
      </head>
      <body>
        {children}
        {devToolbar}
      </body>
    </html>
  );
}
