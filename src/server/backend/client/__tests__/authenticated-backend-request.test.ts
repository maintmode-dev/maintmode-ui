import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as sessionTokenStub from "../../../../../tests/stubs/session-token";
import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { BackendUnauthorizedError } from "@/server/backend/errors/backend-request-error";

const ORIGINAL_ACCESS_TOKEN = sessionTokenStub.TEST_SESSION.accessToken;
const ROTATED_ACCESS_TOKEN = "rotated-access-token";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("authenticatedBackendRequest", () => {
  beforeEach(() => {
    process.env.MAINTMODE_API_BASE_URL = "https://backend.test";
    process.env.MAINTMODE_API_TIMEOUT_MS = "1000";
    delete process.env.MAINTMODE_ENABLE_MOCK_DATA;

    sessionTokenStub.readActiveSession.mockReset();
    sessionTokenStub.forceSessionRefresh.mockReset();
    sessionTokenStub.readActiveSession.mockResolvedValue({
      ...sessionTokenStub.TEST_SESSION,
      accessToken: ORIGINAL_ACCESS_TOKEN,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("attaches Authorization Bearer from the active session", async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchSpy);

    const response = await authenticatedBackendRequest<{ ok: boolean }>({
      method: "GET",
      path: "/api/v1/me",
    });

    expect(response.ok).toBe(true);
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(init.headers).toEqual(
      expect.objectContaining({ authorization: `Bearer ${ORIGINAL_ACCESS_TOKEN}` }),
    );
  });

  it("throws BackendUnauthorizedError when there is no active session", async () => {
    sessionTokenStub.readActiveSession.mockResolvedValueOnce(null);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({})));

    await expect(
      authenticatedBackendRequest({ method: "GET", path: "/api/v1/me" }),
    ).rejects.toBeInstanceOf(BackendUnauthorizedError);
  });

  it("refreshes and retries with the rotated token when the backend returns 401", async () => {
    sessionTokenStub.forceSessionRefresh.mockResolvedValueOnce({
      ...sessionTokenStub.TEST_SESSION,
      accessToken: ROTATED_ACCESS_TOKEN,
    });
    let call = 0;
    const fetchSpy = vi.fn<typeof fetch>(async () => {
      call += 1;
      if (call === 1) {
        return jsonResponse({ code: "unauthorized" }, 401);
      }
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const response = await authenticatedBackendRequest<{ ok: boolean }>({
      method: "GET",
      path: "/api/v1/me",
    });

    expect(response.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const retryInit = fetchSpy.mock.calls[1]?.[1] as RequestInit;
    expect(retryInit.headers).toEqual(
      expect.objectContaining({ authorization: `Bearer ${ROTATED_ACCESS_TOKEN}` }),
    );
  });

  it("does not retry when forceSessionRefresh returns the same access token", async () => {
    sessionTokenStub.forceSessionRefresh.mockResolvedValueOnce({
      ...sessionTokenStub.TEST_SESSION,
      accessToken: ORIGINAL_ACCESS_TOKEN, // same token = no point retrying
    });
    const fetchSpy = vi.fn(async () => jsonResponse({ code: "unauthorized" }, 401));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      authenticatedBackendRequest({ method: "GET", path: "/api/v1/me" }),
    ).rejects.toBeInstanceOf(BackendUnauthorizedError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("propagates BackendUnauthorizedError when refresh itself fails", async () => {
    sessionTokenStub.forceSessionRefresh.mockResolvedValueOnce(null);
    const fetchSpy = vi.fn(async () => jsonResponse({ code: "unauthorized" }, 401));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      authenticatedBackendRequest({ method: "GET", path: "/api/v1/me" }),
    ).rejects.toBeInstanceOf(BackendUnauthorizedError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("propagates non-401 errors without attempting refresh", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ code: "internal" }, 500));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      authenticatedBackendRequest({ method: "GET", path: "/api/v1/me" }),
    ).rejects.toMatchObject({ status: 500 });
    expect(sessionTokenStub.forceSessionRefresh).not.toHaveBeenCalled();
  });
});
