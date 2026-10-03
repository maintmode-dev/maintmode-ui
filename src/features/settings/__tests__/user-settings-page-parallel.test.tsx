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

/**
 * The break-glass account signs in by the password in the server's secrets, and
 * the backend refuses a personal one on it — a form there could only fail.
 */
describe("UserSettingsPage — the break-glass account", () => {
  const ME = (email: string) => ({
    id: "u-1",
    email,
    display_name: "Someone",
    roles: ["admin"],
    connected_providers: [],
    password_set: false,
  });

  function renderAs(email: string) {
    bffFetch.mockImplementation((path: string) =>
      Promise.resolve(path === "/api/me" ? ME(email) : { methods: [] }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <UserSettingsPage />
      </QueryClientProvider>,
    );
  }

  it("shows where its password lives instead of a form", async () => {
    const view = renderAs("break-glass@maintmode.invalid");

    await waitFor(() => expect(view.getByText(/the break-glass account/i)).toBeTruthy());
    expect(view.queryByLabelText("New password")).toBeNull();
  });

  it("keeps the form for everyone else", async () => {
    const view = renderAs("someone@example.test");

    await waitFor(() => expect(view.getByLabelText("New password")).toBeTruthy());
  });
});
