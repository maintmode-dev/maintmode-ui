import type { ReactNode } from "react";
import { ThemeProvider } from "@/app/theme-provider";

/**
 * Provider tree for the routes reachable without a session (`/login`,
 * `/accept-invite`). Deliberately just `ThemeProvider` — the theme toggle is
 * the only app-wide context these two screens consume.
 *
 * What they must NOT get is `AppProviders`: that pulls in React Query, the
 * Tooltip provider, sonner and `TimezoneProvider` (~25 KB gzip) for screens
 * that neither run a query nor render a timestamp. `/login` is the cold-cache
 * entry point for every session, so it is the worst place to pay that.
 *
 * The precondition is that nothing under here calls `useQuery` — without a
 * `QueryClientProvider` above it, React Query throws "No QueryClient set" and
 * the page white-screens. `/accept-invite` resolves its invitation preview on
 * the server for exactly this reason, and
 * `features/auth/__tests__/accept-invite-no-query-provider.test.tsx` guards it
 * by walking the page's transitive import graph. Keep that test passing before
 * adding anything to these routes.
 *
 * Note that `TimezoneProvider` is absent too, so `useTimezone` is unavailable
 * here — fine today, since neither screen shows a time. A public screen that
 * needs one should format it on the server rather than reach for the provider.
 * `TzInitScript` still runs, from the root `<head>`, so the zone cookie is
 * seeded on these pages as before.
 */
export default function PublicLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
