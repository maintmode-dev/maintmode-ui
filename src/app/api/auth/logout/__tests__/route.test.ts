import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/auth/logout/route";
import * as sessionTokenStub from "../../../../../../tests/stubs/session-token";
import * as authConfigStub from "../../../../../../tests/stubs/auth-config";

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    process.env.MAINTMODE_API_BASE_URL = "https://backend.test";
    process.env.MAINTMODE_API_TIMEOUT_MS = "1000";
    delete process.env.MAINTMODE_ENABLE_MOCK_DATA;

    sessionTokenStub.readActiveSession.mockReset();
    sessionTokenStub.clearActiveSession.mockReset();
    authConfigStub.signOut.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects requests with no Origin and no Referer (CSRF guard)", async () => {
    const response = await POST(
      new Request("https://ui.test/api/auth/logout", { method: "POST" }),
    );
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.code).toBe("FORBIDDEN");
    expect(authConfigStub.signOut).not.toHaveBeenCalled();
    expect(sessionTokenStub.clearActiveSession).not.toHaveBeenCalled();
  });

  it("rejects requests with a cross-origin Origin header", async () => {
    const response = await POST(
      new Request("https://ui.test/api/auth/logout", {
        method: "POST",
        headers: { origin: "https://evil.test" },
      }),
    );
    expect(response.status).toBe(403);
    expect(authConfigStub.signOut).not.toHaveBeenCalled();
  });

  it("rejects requests with a cross-origin Referer when Origin is missing", async () => {
    const response = await POST(
      new Request("https://ui.test/api/auth/logout", {
        method: "POST",
        headers: { referer: "https://evil.test/" },
      }),
    );
    expect(response.status).toBe(403);
    expect(authConfigStub.signOut).not.toHaveBeenCalled();
  });

  it("clears the local session and redirects to /login on a same-origin request", async () => {
    sessionTokenStub.readActiveSession.mockResolvedValueOnce(null);
    const response = await POST(
      new Request("https://ui.test/api/auth/logout", {
        method: "POST",
        headers: { origin: "https://ui.test" },
      }),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://ui.test/login");
    expect(authConfigStub.signOut).toHaveBeenCalledWith({ redirect: false });
    expect(sessionTokenStub.clearActiveSession).toHaveBeenCalled();
  });

  it("respects ?next= when it is a safe relative URI", async () => {
    sessionTokenStub.readActiveSession.mockResolvedValueOnce(null);
    const response = await POST(
      new Request("https://ui.test/api/auth/logout?next=%2Fcalendar", {
        method: "POST",
        headers: { origin: "https://ui.test" },
      }),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://ui.test/calendar");
  });

  it("falls back to /login when ?next= is unsafe", async () => {
    sessionTokenStub.readActiveSession.mockResolvedValueOnce(null);
    const response = await POST(
      new Request("https://ui.test/api/auth/logout?next=https%3A%2F%2Fevil.test", {
        method: "POST",
        headers: { origin: "https://ui.test" },
      }),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://ui.test/login");
  });
});
