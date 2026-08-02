// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * `useCalendarQuery` grew an optional second argument (`{ enabled }`) so the
 * calendar page could gate its query on `hydrated`. These two screens call the
 * hook with ONE argument and rely entirely on the `?? true` default — if that
 * default ever regresses to `=== true` or similar, they would silently stop
 * fetching and render a permanent skeleton with no error.
 *
 * Neither screen had any test before this change. These are deliberately
 * minimal: they assert a request goes out, which is exactly the property the
 * new parameter could break.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

vi.mock("@/features/_shared/timezone/use-timezone", () => ({
  useTimezone: () => ({ zone: "UTC", ready: true }),
}));

import { ResourceRelatedMaintenance } from "@/features/resources/resource-related-maintenance";
import { NotifyChannelRelatedMaintenance } from "@/features/notify-channels/notify-channel-related-maintenance";

let calls: string[] = [];

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/calendar")) calls.push(url);
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("consumers that omit the `enabled` option still fetch", () => {
  it("ResourceRelatedMaintenance requests its window", async () => {
    render(<ResourceRelatedMaintenance resourceId="res-1" />, { wrapper });

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(new URL(calls[0], "http://localhost").searchParams.getAll("resource_ids")).toEqual(["res-1"]);
  });

  it("NotifyChannelRelatedMaintenance requests its window", async () => {
    render(<NotifyChannelRelatedMaintenance channelId="ch-1" />, { wrapper });

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(new URL(calls[0], "http://localhost").searchParams.getAll("channel_ids")).toEqual(["ch-1"]);
  });
});
