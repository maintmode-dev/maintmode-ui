import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppProviders } from "./providers";
import { ThemeInitScript } from "./theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Maintmode",
  description: "Maintenance operations frontend",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
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
      </body>
    </html>
  );
}
