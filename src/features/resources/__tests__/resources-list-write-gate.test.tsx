// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/domain/admin/user";
import type { Role } from "@/domain/auth/permissions";
import type { ResourceListPage } from "../queries/use-resources-query";

/**
 * RUK-213 render-level gate: the "New resource" create CTA is shown to
 * write-capable roles and hidden from guests. This is the automated tripwire
 * that catches over-restriction (CTA accidentally hidden from a writer) and
 * under-restriction (CTA leaks to a guest) in CI — not just the manual matrix.
 */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Drive identity (the gate input) per-test; only `roles` matters here.
const meData = vi.fn<() => Partial<User> | undefined>(() => undefined);
vi.mock("@/features/_shared/queries/use-me-query", () => ({
  useMeQuery: () => ({ data: meData() }),
}));

// Stub the list query so the page renders without network. `total: 0` +
// no name filter puts the page in its neutral empty state. Partial mock: only
// the list query is stubbed; the create dialog's mutation hooks (from the same
// module) stay real so the page mounts.
const resourcesData = vi.fn<() => ResourceListPage>(() => ({
  resources: [],
  limit: 50,
  offset: 0,
  total: 0,
}));
vi.mock("../queries/use-resources-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../queries/use-resources-query")>()),
  useResourcesQuery: () => ({
    data: resourcesData(),
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { ResourcesListPage } from "../resources-list-page";

function renderPage(roles: Role[] | undefined) {
  meData.mockReturnValue(roles ? { roles } : undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ResourcesListPage />
    </QueryClientProvider>,
  );
}

const createCtas = () => screen.queryAllByRole("button", { name: /New resource/ });

describe("ResourcesListPage write gate (RUK-213)", () => {
  it("shows the create CTA to a writer (over-restriction tripwire)", () => {
    renderPage(["guest", "editor"]);
    // Empty catalog + writer surfaces BOTH the header and empty-state CTAs.
    // Assert exactly 2 so a single-gate regression (only one CTA hidden) fails.
    expect(createCtas()).toHaveLength(2);
  });

  it("hides the create CTA from a guest (under-restriction tripwire)", () => {
    renderPage(["guest"]);
    expect(createCtas()).toHaveLength(0);
  });

  it("shows no create CTA and a neutral empty-state caption for a guest", () => {
    renderPage(["guest"]);
    // Empty catalog: no create button anywhere, neutral (non-inviting) copy.
    expect(screen.queryByRole("button", { name: /New resource/ })).toBeNull();
    expect(screen.getByText("No resources have been added yet.")).toBeTruthy();
  });
});
