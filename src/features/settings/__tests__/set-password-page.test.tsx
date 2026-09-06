// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { SetPasswordPage } from "@/features/settings/set-password-page";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const useMeQuery = vi.fn();
vi.mock("@/features/_shared/queries/use-me-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/queries/use-me-query")>();
  return { ...actual, useMeQuery: () => useMeQuery() };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => cleanup());
beforeEach(() => vi.clearAllMocks());

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SetPasswordPage />
    </QueryClientProvider>,
  );
}

describe("who this page is for", () => {
  it("shows the form to an account with no password", () => {
    useMeQuery.mockReturnValue({ isPending: false, isSuccess: true, data: { password_set: false } });
    renderPage();

    expect(screen.getByLabelText("New password")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  // AC-9. The redirect is client-side by necessity (a page cannot call
  // `readActiveSession`, which writes cookies), so this asserts the redirect
  // fires and that nothing is submittable before it does — NOT the absence of a
  // paint, which this mechanism cannot promise.
  it("sends an account that already has a password to the profile", async () => {
    useMeQuery.mockReturnValue({ isPending: false, isSuccess: true, data: { password_set: true } });
    renderPage();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/settings/profile"));
    expect(screen.queryByLabelText("New password")).toBeNull();
  });

  // `undefined` is not `false`: the backend cannot say, so the card would offer
  // nothing anyway, and the profile is where the rest of the account lives.
  it("sends an unknown password state to the profile too", async () => {
    useMeQuery.mockReturnValue({ isPending: false, isSuccess: true, data: {} });
    renderPage();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/settings/profile"));
    expect(screen.queryByLabelText("New password")).toBeNull();
  });

  it("shows no form while the answer is still loading", () => {
    useMeQuery.mockReturnValue({ isPending: true, isSuccess: false, data: undefined });
    renderPage();

    expect(screen.queryByLabelText("New password")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });
});
