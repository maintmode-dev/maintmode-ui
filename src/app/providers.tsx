"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";

import { ThemeProvider } from "./theme-provider";
import { TimezoneProvider } from "@/features/_shared/timezone/timezone-provider";
import { TooltipProvider } from "@/shared/ui/shadcn/tooltip";
import { Toaster } from "@/shared/ui/shadcn/sonner";

interface AppProvidersProps {
  children: ReactNode;
  /**
   * Display timezone read from the `mm.tz` cookie by the root layout (RUK-233),
   * or `null` when the server had none. Defaults to `null` so this file stays
   * independently valid: with `null` the provider renders the UTC placeholder on
   * the first frame, i.e. exactly the pre-RUK-233 behavior. That also makes
   * `serverZone={null}` the one-line rollback for the whole feature.
   */
  serverZone?: string | null;
}

export function AppProviders({ children, serverZone = null }: Readonly<AppProvidersProps>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 30_000,
          },
        },
      }),
  );

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        {/* TimezoneProvider MUST stay INSIDE QueryClientProvider: it calls
            `useMeQuery` to read the authoritative `me.timezone`, and outside it
            React Query throws "No QueryClient set" and the app hard-errors on
            every screen. No test guards this — every suite mocks `useMeQuery`,
            so the suite stays green either way. Verified only in a browser. */}
        <TimezoneProvider serverZone={serverZone}>
          <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
        </TimezoneProvider>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
