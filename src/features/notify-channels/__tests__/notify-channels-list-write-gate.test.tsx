// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/domain/admin/user";
import type { Role } from "@/domain/auth/permissions";
import type { NotifyChannel } from "@/domain/notify-channel/notify-channel";

/**
 * RUK-213 render-level gate: the "New channel" create CTA is shown to
 * write-capable roles and hidden from guests. Automated tripwire for
 * over-restriction (writer loses the CTA) and under-restriction (guest sees it).
 */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const meData = vi.fn<() => Partial<User> | undefined>(() => undefined);
vi.mock("@/features/_shared/queries/use-me-query", () => ({
  useMeQuery: () => ({ data: meData() }),
}));

// Empty catalog renders the neutral empty state without network. Partial mock:
// only the list query is stubbed; the create dialog's mutation hooks (imported
// from the same module) stay real so the page mounts.
const channelsData = vi.fn<() => NotifyChannel[]>(() => []);
vi.mock("../queries/use-notify-channels-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../queries/use-notify-channels-query")>()),
  useNotifyChannelsQuery: () => ({
    data: channelsData(),
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { NotifyChannelsListPage } from "../notify-channels-list-page";

function renderPage(roles: Role[] | undefined) {
  meData.mockReturnValue(roles ? { roles } : undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NotifyChannelsListPage />
    </QueryClientProvider>,
  );
}

const createCtas = () => screen.queryAllByRole("button", { name: /New channel/ });

describe("NotifyChannelsListPage write gate (RUK-213)", () => {
  it("shows the create CTA to a writer (over-restriction tripwire)", () => {
    renderPage(["admin"]);
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
    expect(screen.queryByRole("button", { name: /New channel/ })).toBeNull();
    expect(screen.getByText("No channels have been added yet.")).toBeTruthy();
  });
});
