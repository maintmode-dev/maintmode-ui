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

// `vi.mock` is hoisted above these declarations, so the factory must not close
// over them directly — it reads them through `vi.hoisted` state instead.
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));
const toastSuccess = toasts.success;
const toastError = toasts.error;

import type { Integration } from "@/domain/admin/integration";

import {
  integrationsKey,
  useCreateIntegration,
  usePendingToggleNames,
  useTestIntegration,
  useToggleIntegration,
  useUpdateIntegration,
} from "../queries/use-integrations-queries";

/**
 * RUK-304. These hooks addressed a row by `kind` alone, which stopped
 * identifying a row when `b74a4536` turned `kind` into a category.
 *
 * The module is tested because both of its defects are SILENT: they produce no
 * type error, no crash and no failed request — one flips the wrong rows in the
 * cache, the other disables the wrong switches. Nothing else in the suite
 * touches this file, so without these cases both bugs can be reintroduced and
 * the full gate stays green. That was measured, not assumed.
 */

const ROWS: Integration[] = [
  {
    id: "i-slack",
    kind: "notify",
    name: "slack",
    enabled: true,
    config: {},
    secrets_set: {},
    created_at: "",
    updated_at: "",
  },
  {
    id: "i-telegram",
    kind: "notify",
    name: "telegram",
    enabled: true,
    config: {},
    secrets_set: {},
    created_at: "",
    updated_at: "",
  },
  {
    id: "i-email",
    kind: "notify",
    name: "email",
    enabled: true,
    config: {},
    secrets_set: {},
    created_at: "",
    updated_at: "",
  },
];

beforeEach(() => {
  bffFetchMock.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
});
afterEach(cleanup);

function seededClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(integrationsKey(), ROWS);
  return client;
}

function wrapperFor(client: QueryClient) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "TestQueryWrapper";
  return Wrapper;
}

/** The cached rows, by system, after whatever the test just did. */
function cachedByName(client: QueryClient): Record<string, Integration> {
  const list = client.getQueryData<Integration[]>(integrationsKey()) ?? [];
  return Object.fromEntries(list.map((r) => [r.name, r]));
}

describe("useToggleIntegration — optimistic update targets ONE row", () => {
  it("flips only the row that was toggled", async () => {
    const client = seededClient();
    // Never resolves: the optimistic state is what this asserts, and settling
    // would let the refetch overwrite it before the assertion runs.
    bffFetchMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useToggleIntegration(), { wrapper: wrapperFor(client) });

    act(() => {
      result.current.mutate({ ref: { kind: "notify", name: "slack" }, enabled: false });
    });

    await waitFor(() => expect(cachedByName(client).slack.enabled).toBe(false));
    // The defect this exists for: matching on `kind` alone matches every
    // transport, so one Slack toggle would carry the other two with it.
    expect(cachedByName(client).telegram.enabled).toBe(true);
    expect(cachedByName(client).email.enabled).toBe(true);
  });

  it("rolls back only the row that failed", async () => {
    const client = seededClient();
    bffFetchMock.mockRejectedValue(new Error("backend said no"));
    const { result } = renderHook(() => useToggleIntegration(), { wrapper: wrapperFor(client) });

    act(() => {
      result.current.mutate({ ref: { kind: "notify", name: "slack" }, enabled: false });
    });

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(cachedByName(client).slack.enabled).toBe(true);
    expect(cachedByName(client).telegram.enabled).toBe(true);
    expect(cachedByName(client).email.enabled).toBe(true);
  });

  it("names the system in the failure toast, not the category", async () => {
    const client = seededClient();
    bffFetchMock.mockRejectedValue(new Error("backend said no"));
    const { result } = renderHook(() => useToggleIntegration(), { wrapper: wrapperFor(client) });

    act(() => {
      result.current.mutate({ ref: { kind: "notify", name: "slack" }, enabled: false });
    });

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    // "Couldn't toggle notify" would be the symptom of reading `kind`.
    expect(String(toastError.mock.calls[0][0])).toContain("slack");
    expect(String(toastError.mock.calls[0][0])).not.toContain("notify");
  });

  it("addresses the backend by the pair", async () => {
    const client = seededClient();
    bffFetchMock.mockResolvedValue(ROWS[0]);
    const { result } = renderHook(() => useToggleIntegration(), { wrapper: wrapperFor(client) });

    act(() => {
      result.current.mutate({ ref: { kind: "notify", name: "slack" }, enabled: false });
    });

    await waitFor(() => expect(bffFetchMock).toHaveBeenCalled());
    expect(bffFetchMock.mock.calls[0][0]).toBe("/api/admin/integrations/notify/slack/toggle");
  });
});

describe("usePendingToggleNames — busy state targets ONE row", () => {
  it("reports the system in flight, so other switches stay usable", async () => {
    const client = seededClient();
    bffFetchMock.mockReturnValue(new Promise(() => {}));
    const wrapper = wrapperFor(client);
    const toggle = renderHook(() => useToggleIntegration(), { wrapper });
    const pending = renderHook(() => usePendingToggleNames(), { wrapper });

    act(() => {
      toggle.result.current.mutate({ ref: { kind: "notify", name: "slack" }, enabled: false });
    });

    await waitFor(() => expect(pending.result.current.has("slack")).toBe(true));
    // Keyed by category, this set would contain "notify" and the page — which
    // asks `has(name)` — would grey out every transport's switch at once.
    expect(pending.result.current.has("telegram")).toBe(false);
    expect(pending.result.current.has("email")).toBe(false);
    expect(pending.result.current.has("notify")).toBe(false);
  });
});

describe("the remaining hooks address rows by the pair", () => {
  it("useUpdateIntegration PATCHes the pair, not the category", async () => {
    const client = seededClient();
    bffFetchMock.mockResolvedValue(ROWS[2]);
    const { result } = renderHook(() => useUpdateIntegration(), { wrapper: wrapperFor(client) });

    act(() => {
      result.current.mutate({ ref: { kind: "notify", name: "email" }, body: { enabled: false } });
    });

    await waitFor(() => expect(bffFetchMock).toHaveBeenCalled());
    // `/api/admin/integrations/notify` is well-formed and addresses nothing —
    // the quiet failure this assertion pins.
    expect(bffFetchMock.mock.calls[0][0]).toBe("/api/admin/integrations/notify/email");
  });

  it("useUpdateIntegration names the system on success and on failure", async () => {
    const client = seededClient();
    bffFetchMock.mockResolvedValue(ROWS[2]);
    const ok = renderHook(() => useUpdateIntegration(), { wrapper: wrapperFor(client) });

    act(() => {
      ok.result.current.mutate({ ref: { kind: "notify", name: "email" }, body: {} });
    });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    // Success reads the RESPONSE; failure reads the VARIABLES. Two sources, so
    // fixing one branch leaves the other announcing "notify".
    expect(String(toastSuccess.mock.calls[0][0])).toContain("email");

    bffFetchMock.mockRejectedValue(new Error("nope"));
    const failed = renderHook(() => useUpdateIntegration(), { wrapper: wrapperFor(client) });
    act(() => {
      failed.result.current.mutate({ ref: { kind: "notify", name: "email" }, body: {} });
    });
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0][0])).toContain("email");
    expect(String(toastError.mock.calls[0][0])).not.toContain("notify");
  });

  it("useCreateIntegration sends both halves in the body", async () => {
    const client = seededClient();
    bffFetchMock.mockResolvedValue(ROWS[0]);
    const { result } = renderHook(() => useCreateIntegration(), { wrapper: wrapperFor(client) });

    act(() => {
      result.current.mutate({
        kind: "notify",
        name: "slack",
        enabled: true,
        config: {},
        secrets: {},
      });
    });

    await waitFor(() => expect(bffFetchMock).toHaveBeenCalled());
    const sent = JSON.parse(String((bffFetchMock.mock.calls[0][1] as { body: string }).body));
    expect(sent.kind).toBe("notify");
    expect(sent.name).toBe("slack");
  });

  it("useTestIntegration posts to the pair's test path", async () => {
    const client = seededClient();
    bffFetchMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useTestIntegration(), { wrapper: wrapperFor(client) });

    act(() => {
      result.current.mutate({
        ref: { kind: "notify", name: "email" },
        body: { config: {}, secrets: {}, to: "ops@example.com" },
      });
    });

    await waitFor(() => expect(bffFetchMock).toHaveBeenCalled());
    expect(bffFetchMock.mock.calls[0][0]).toBe("/api/admin/integrations/notify/email/test");
  });
});

/**
 * Concurrency, which the hook's docblock claims to handle and nothing measured.
 *
 * Two toggles can be in flight at once — the screen has three switches and
 * nothing serialises them. The settle-time refetch is therefore gated on
 * `isMutating(...) > 1`, so that only the LAST mutation to settle reconciles
 * with server truth; refetching while another flip is still pending would
 * overwrite its optimistic state with a response that predates it.
 */
describe("concurrent toggles", () => {
  it("holds both optimistic flips independently", async () => {
    const client = seededClient();
    bffFetchMock.mockReturnValue(new Promise(() => {}));
    const wrapper = wrapperFor(client);
    const first = renderHook(() => useToggleIntegration(), { wrapper });
    const second = renderHook(() => useToggleIntegration(), { wrapper });

    act(() => {
      first.result.current.mutate({ ref: { kind: "notify", name: "slack" }, enabled: false });
    });
    act(() => {
      second.result.current.mutate({ ref: { kind: "notify", name: "email" }, enabled: false });
    });

    await waitFor(() => {
      expect(cachedByName(client).slack.enabled).toBe(false);
      expect(cachedByName(client).email.enabled).toBe(false);
    });
    // The row nobody touched is untouched — the pair predicates hold under
    // concurrency, not just one at a time.
    expect(cachedByName(client).telegram.enabled).toBe(true);
  });

  it("tracks every in-flight system, not just the latest", async () => {
    const client = seededClient();
    bffFetchMock.mockReturnValue(new Promise(() => {}));
    const wrapper = wrapperFor(client);
    const first = renderHook(() => useToggleIntegration(), { wrapper });
    const second = renderHook(() => useToggleIntegration(), { wrapper });
    const pending = renderHook(() => usePendingToggleNames(), { wrapper });

    act(() => {
      first.result.current.mutate({ ref: { kind: "notify", name: "slack" }, enabled: false });
    });
    act(() => {
      second.result.current.mutate({ ref: { kind: "notify", name: "email" }, enabled: false });
    });

    // Reading a single mutation's `variables` would report only the last one,
    // which is why this comes from the mutation cache.
    await waitFor(() => {
      expect(pending.result.current.has("slack")).toBe(true);
      expect(pending.result.current.has("email")).toBe(true);
    });
    expect(pending.result.current.has("telegram")).toBe(false);
  });

  it("rolls back only the failed row while the other stays flipped", async () => {
    const client = seededClient();
    const wrapper = wrapperFor(client);
    const failing = renderHook(() => useToggleIntegration(), { wrapper });
    const pendingForever = renderHook(() => useToggleIntegration(), { wrapper });

    bffFetchMock.mockReturnValueOnce(new Promise(() => {}));
    act(() => {
      pendingForever.result.current.mutate({
        ref: { kind: "notify", name: "email" },
        enabled: false,
      });
    });

    bffFetchMock.mockRejectedValueOnce(new Error("backend said no"));
    act(() => {
      failing.result.current.mutate({ ref: { kind: "notify", name: "slack" }, enabled: false });
    });

    await waitFor(() => expect(cachedByName(client).slack.enabled).toBe(true));
    // A whole-list snapshot rollback would have clobbered this one too.
    expect(cachedByName(client).email.enabled).toBe(false);
  });
});
