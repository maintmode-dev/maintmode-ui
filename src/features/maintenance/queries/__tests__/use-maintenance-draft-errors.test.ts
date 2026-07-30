// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BffError } from "@/features/_shared/api/bff-fetch";
import type { MaintenanceDraftInput } from "@/domain/maintenance/maintenance";

import { maintenanceDetailKey } from "../use-maintenance-detail-query";
import { useCreateMaintenance, useUpdateMaintenance } from "../use-maintenance-draft";

const bffFetchMock = vi.fn();
vi.mock("@/features/_shared/api/bff-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/_shared/api/bff-fetch")>();
  return { ...actual, bffFetch: (...args: unknown[]) => bffFetchMock(...args) };
});

// `vi.hoisted` because the `vi.mock` factory is lifted above plain `const`s.
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

// The real flag is "bff"; the mock branch would short-circuit the mutation
// before it can ever reject, so these tests pin the live path.
const dataSourceMock = vi.hoisted(() => ({ maintenanceWrites: "bff" as "bff" | "mock" }));
vi.mock("@/features/_shared/api/data-source", () => ({ DATA_SOURCE: dataSourceMock }));

const draft: MaintenanceDraftInput = {
  title: "Patch orders-db",
  planned_start: "2026-08-01T10:00:00Z",
  scope: "resource",
  impact: "partial_outage",
  resource_ids: ["r-1"],
  steps: [{ order: 1, description: "Drain traffic", duration: "1h30m" }],
  approver_user_id: "u-9",
  notify_target_channel_ids: ["c-1"],
  mention_user_ids: ["u-1"],
};

let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  dataSourceMock.maintenanceWrites = "bff";
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.clearAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

/** The single string handed to `toast.error`, or "" when nothing was toasted. */
function toastedError(): string {
  const call = toastMock.error.mock.calls[0];
  expect(call, "toast.error was not called").toBeDefined();
  return String((call as unknown[])[0]);
}

/**
 * RUK-218, AC-15. The operator must read the BACKEND's sentence, not a generic
 * one: a 400 on Save is how the form learns a fact it could not have known when
 * it rendered — e.g. a mentioned user was blocked between opening the form and
 * pressing Save (SPEC §4.4). Swallowing `error.message` into "Try again." leaves
 * the operator retrying the same doomed payload with no idea which person to
 * drop.
 */
describe("useUpdateMaintenance error handling", () => {
  it("shows the backend message verbatim on 400 (AC-15)", async () => {
    bffFetchMock.mockRejectedValue(
      new BffError(400, "mentioned user 11111111-1111-1111-1111-111111111111 is blocked"),
    );
    const { result } = renderHook(() => useUpdateMaintenance(), { wrapper });

    result.current.mutate({ id: "m-1", input: draft });
    await waitFor(() => expect(result.current.isError).toBe(true));

    // The whole point of AC-15: the actionable detail survives to the toast.
    expect(toastedError()).toContain("mentioned user 11111111-1111-1111-1111-111111111111 is blocked");
    expect(toastMock.error).toHaveBeenCalledTimes(1);
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("does not replace a 400 with the generic retry copy (AC-15)", async () => {
    bffFetchMock.mockRejectedValue(new BffError(400, "at most 10 mentions"));
    const { result } = renderHook(() => useUpdateMaintenance(), { wrapper });

    result.current.mutate({ id: "m-1", input: draft });
    await waitFor(() => expect(result.current.isError).toBe(true));

    // Guards the fallback branch specifically: a `status === 400` check that
    // regressed to a bare `instanceof` would toast this instead of the message.
    expect(toastedError()).not.toBe("Couldn't save changes. Try again.");
    expect(toastedError()).toContain("at most 10 mentions");
  });

  /**
   * SPEC §1.2: the draft-edit gate answers 409 Conflict (`forbidden status`,
   * backend `httperrors/mapper.go:120-121`) — NOT 403. The 1st edition of the
   * spec claimed 403 and was wrong, which matters because the two codes demand
   * opposite copy: 409 means "someone approved it in another tab, reload", a
   * state the operator can recover from, while "no permission" tells them to
   * give up. This test pins the recoverable reading.
   */
  it("treats 409 as a conflict to refresh, not a permissions refusal", async () => {
    bffFetchMock.mockRejectedValue(new BffError(409, "forbidden status", "forbidden status"));
    const { result } = renderHook(() => useUpdateMaintenance(), { wrapper });

    result.current.mutate({ id: "m-1", input: draft });
    await waitFor(() => expect(result.current.isError).toBe(true));

    const message = toastedError();
    expect(message).toMatch(/changed elsewhere/i);
    expect(message).toMatch(/refresh/i);
    // Never the permissions vocabulary — that would tell the operator to stop
    // rather than reload.
    expect(message).not.toMatch(/permission|forbidden|not allowed|access/i);
  });

  it("refetches the detail on 409 so the stale form can resync", async () => {
    bffFetchMock.mockRejectedValue(new BffError(409, "forbidden status", "forbidden status"));
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useUpdateMaintenance(), { wrapper });

    result.current.mutate({ id: "m-1", input: draft });
    await waitFor(() => expect(result.current.isError).toBe(true));

    // Telling the operator to refresh while serving them the cached draft would
    // make the advice a lie.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: maintenanceDetailKey("m-1") });
  });

  it("does not leak the backend sentence for a 500", async () => {
    bffFetchMock.mockRejectedValue(new BffError(500, "sql: connection refused at pg-01"));
    const { result } = renderHook(() => useUpdateMaintenance(), { wrapper });

    result.current.mutate({ id: "m-1", input: draft });
    await waitFor(() => expect(result.current.isError).toBe(true));

    // AC-15 is scoped to 400 — infrastructure detail is not operator-actionable,
    // so the generic copy is correct here and `error.message` must stay out.
    expect(toastedError()).toBe("Couldn't save changes. Try again.");
    expect(toastedError()).not.toContain("pg-01");
  });

  it("falls back to the generic copy for a non-BffError rejection", async () => {
    bffFetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useUpdateMaintenance(), { wrapper });

    result.current.mutate({ id: "m-1", input: draft });
    await waitFor(() => expect(result.current.isError).toBe(true));

    // An offline browser has no backend message to show; `error.message` here is
    // fetch-internal noise.
    expect(toastedError()).toBe("Couldn't save changes. Try again.");
  });
});

describe("useCreateMaintenance error handling", () => {
  it("shows the backend message verbatim on 400 (AC-15)", async () => {
    bffFetchMock.mockRejectedValue(new BffError(400, "mentioned user u-1 is blocked"));
    const { result } = renderHook(() => useCreateMaintenance(), { wrapper });

    result.current.mutate(draft);
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toastedError()).toContain("mentioned user u-1 is blocked");
    expect(toastedError()).not.toBe("Couldn't create the draft. Try again.");
  });

  it("does not leak the backend sentence for a 500", async () => {
    bffFetchMock.mockRejectedValue(new BffError(500, "sql: connection refused at pg-01"));
    const { result } = renderHook(() => useCreateMaintenance(), { wrapper });

    result.current.mutate(draft);
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toastedError()).toBe("Couldn't create the draft. Try again.");
    expect(toastedError()).not.toContain("pg-01");
  });
});
