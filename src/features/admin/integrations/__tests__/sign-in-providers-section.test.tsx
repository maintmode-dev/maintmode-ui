// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SignInProvidersSection } from "../sign-in-providers-section";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: vi.fn().mockResolvedValue([]) };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SignInProvidersSection />
    </QueryClientProvider>,
  );
}

describe("SignInProvidersSection", () => {
  /**
   * The heading is also the marker the production bundle grep searches for
   * (SPEC §7.3). Pinned as a literal so a reword cannot silently invalidate
   * that manual check — the grep would then look for a string that no longer
   * exists and pass for the wrong reason.
   */
  it("is headed 'Sign-in providers'", () => {
    renderSection();
    expect(screen.getByText("Sign-in providers")).toBeTruthy();
  });

  /**
   * The two names the backend registry actually serves. `github` is NOT among
   * them: it exists only on an unmerged backend branch, so a row for it would
   * address a pair the deployed backend answers with a 400.
   */
  it("lists the two providers the backend serves", () => {
    renderSection();
    expect(screen.getByText("Google")).toBeTruthy();
    expect(screen.getByText("Custom OIDC")).toBeTruthy();
    expect(screen.queryByText("GitHub")).toBeNull();
  });

  it("says changes apply without a restart", () => {
    renderSection();
    expect(screen.getByText(/no restart/i)).toBeTruthy();
  });

  it("shows no notification-transport copy", () => {
    renderSection();
    expect(screen.queryByText(/deliver notifications/i)).toBeNull();
  });
});
