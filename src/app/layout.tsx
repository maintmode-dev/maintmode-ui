import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppProviders } from "./providers";
import { ThemeInitScript } from "./theme-provider";
import { DEV_BYPASS_ENABLED } from "@/server/auth/auth-config";
import { devLoginAsAction } from "@/server/auth/auth-actions";
import "./globals.css";

export const metadata: Metadata = {
  title: "Maintmode",
  description: "Maintenance operations frontend",
};

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
        {/* Anti-flash: applies the stored theme to data-theme before first
            paint (Next.js "preventing flash before hydration"). The component
            swaps the script type client-side to dodge React 19's "script tag
            while rendering" error. */}
        <ThemeInitScript />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
        {devToolbar}
      </body>
    </html>
  );
}
