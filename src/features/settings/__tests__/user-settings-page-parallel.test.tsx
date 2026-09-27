// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";

import { UserSettingsPage } from "@/features/settings/user-settings-page";

const bffFetch = vi.fn();
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (...args: unknown[]) => bffFetch(...args) };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * Step 9 (web-perf) of the post-implementation pass on the v0.2.0-rc fixes.
 * The sign-in methods card mounts only after `/me` resolves, so a list query
 * started by the card alone waited for `/me` first — two independent reads in
 * series on every visit to the profile. The page starts it beside `/me`.
 */
describe("UserSettingsPage — independent reads start together", () => {
  it("asks for the sign-in methods while /me is still in flight", async () => {
    bffFetch.mockImplementation(() => new Promise(() => {}));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <UserSettingsPage />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      const paths = bffFetch.mock.calls.map((call) => call[0]);
      expect(paths).toContain("/api/me");
      expect(paths).toContain("/api/sign-in-methods");
    });
  });
});
