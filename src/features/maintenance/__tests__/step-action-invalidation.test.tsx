// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bffFetchMock = vi.fn();
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (...args: unknown[]) => bffFetchMock(...args) };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useStepAction, type StepAction } from "../queries/use-step-actions";

beforeEach(() => {
  bffFetchMock.mockReset();
});
afterEach(cleanup);

/**
 * Records every key handed to `invalidateQueries`, so a test can assert which
 * caches a mutation actually touches rather than inferring it from behavior.
 * Observing refetches instead would be unreliable here: with no query mounted
 * and `bffFetch` mocked, an invalidation of an absent cache entry produces no
 * visible side effect at all — the assertion would pass either way.
 */
function trackedClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidated: unknown[][] = [];
  const original = client.invalidateQueries.bind(client);
  client.invalidateQueries = ((filters?: { queryKey?: unknown[] }) => {
    if (filters?.queryKey) invalidated.push(filters.queryKey);
    return original(filters as never);
  }) as typeof client.invalidateQueries;
  return { client, invalidated };
}

function renderStepAction(client: QueryClient) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useStepAction(), { wrapper });
}

/** Did anything invalidate the calendar, at any month or with a bare prefix? */
function invalidatedCalendar(keys: unknown[][]): boolean {
  return keys.some((key) => Array.isArray(key) && key[0] === "calendar");
}

async function runStep(action: StepAction) {
  bffFetchMock.mockResolvedValue(undefined);
  const { client, invalidated } = trackedClient();
  const { result } = renderStepAction(client);

  await act(async () => {
    result.current.mutate({ maintenanceId: "m-1", stepId: "s-1", action });
  });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  return invalidated;
}

describe("useStepAction — cache invalidation scope", () => {
  it("invalidates the maintenance detail after a successful step action", async () => {
    // Load-bearing: completing the last step flips the maintenance-level
    // `can_complete` flag, and the step row itself has to redraw. Without this
    // the operator sees a stale step list on the page they are staring at.
    const invalidated = await runStep("complete");
    expect(invalidated).toContainEqual(["maintenance-detail", "m-1"]);
  });

  it("does NOT invalidate the calendar after a successful step action", async () => {
    // A step transition changes nothing the calendar renders — not the window,
    // the title, the scope, nor the maintenance status. `["calendar"]` is a bare
    // prefix, so invalidating it would drop EVERY cached month; 8 steps would
    // mean 8 needless double hops through the BFF, exactly while the operator
    // watches a live run. Contrast `useMaintenanceAction`, where the calendar
    // invalidation is correct because the status the calendar paints moves.
    const invalidated = await runStep("complete");
    expect(invalidatedCalendar(invalidated)).toBe(false);
  });

  it.each(["start", "complete", "cancel"] as const)(
    "invalidates detail but not calendar for a %s step action",
    async (action) => {
      // All three transitions are step-level, so the scope rule is the same for
      // each: none of them can move a field the calendar draws.
      const invalidated = await runStep(action);
      expect(invalidated).toContainEqual(["maintenance-detail", "m-1"]);
      expect(invalidatedCalendar(invalidated)).toBe(false);
    },
  );
});
