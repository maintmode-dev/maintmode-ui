import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/me/password/route";

const readActiveSession = vi.fn();
const changeBackendPassword = vi.fn();
const isSameOriginRequest = vi.fn(() => true);

vi.mock("@/server/auth/session-token", () => ({
  readActiveSession: () => readActiveSession(),
}));
vi.mock("@/server/auth/backend-token-exchange", () => ({
  changeBackendPassword: (...args: unknown[]) => changeBackendPassword(...args),
}));
vi.mock("@/server/backend/security/csrf", () => ({
  isSameOriginRequest: () => isSameOriginRequest(),
}));

function post(body: unknown) {
  return new Request("https://app.test/api/me/password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  isSameOriginRequest.mockReturnValue(true);
  readActiveSession.mockResolvedValue({
    accessToken: "access-1",
    refreshToken: "refresh-1",
    accessTokenExpiresAt: Date.now() + 600_000,
  });
});

describe("the session is read once and sent verbatim", () => {
  // AC-6. `readActiveSession` rotates the refresh token when the access token
  // is near expiry, so a second read can hand back a different token — and the
  // backend answers a superseded `refresh_token` with a 401 and NO change.
  it("reads the session exactly once per request", async () => {
    changeBackendPassword.mockResolvedValue({ ok: true });

    await POST(post({ current_password: "old-password", new_password: "new-password-here" }));

    expect(readActiveSession).toHaveBeenCalledTimes(1);
  });

  // Without this the backend revokes EVERY session including the caller's, and
  // the user is signed out by their own success.
  it("sends the refresh token so the caller's own session survives", async () => {
    changeBackendPassword.mockResolvedValue({ ok: true });

    await POST(post({ current_password: "old-password", new_password: "new-password-here" }));

    expect(changeBackendPassword).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "access-1", refreshToken: "refresh-1" }),
    );
  });

  it("never retries the mutation", async () => {
    changeBackendPassword.mockResolvedValue({ ok: false, kind: "session-stale" });

    await POST(post({ new_password: "new-password-here" }));

    // One call, however it failed. A retry would send a token the refresh had
    // already replaced, and the password would silently stay unchanged.
    expect(changeBackendPassword).toHaveBeenCalledTimes(1);
  });

  it("omits current_password entirely when the account has none", async () => {
    changeBackendPassword.mockResolvedValue({ ok: true });

    await POST(post({ new_password: "new-password-here" }));

    // Absent, not empty: the backend rejects the field outright for an account
    // with no password, so "" and undefined are different requests.
    expect(changeBackendPassword).toHaveBeenCalledWith(
      expect.objectContaining({ currentPassword: undefined }),
    );
  });
});

describe("no failure may answer 401", () => {
  // AC-7, and the reason this route exists at all. `bffFetch` navigates to
  // /login on any 401 carrying AUTH_REQUIRED, behind a never-resolving promise
  // — so answering a wrong current password with a 401 signs the operator out
  // on their most common mistake, with no message.
  it("answers a wrong current password with a renderable status", async () => {
    changeBackendPassword.mockResolvedValue({ ok: false, kind: "wrong-current-password" });

    const response = await POST(post({ current_password: "wrong", new_password: "new-password-here" }));

    expect(response.status).toBe(422);
    expect(response.status).not.toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "WRONG_CURRENT_PASSWORD" });
  });

  it("distinguishes a stale session from a wrong password", async () => {
    changeBackendPassword.mockResolvedValue({ ok: false, kind: "session-stale" });

    const response = await POST(post({ new_password: "new-password-here" }));

    // Different meaning, different copy: nothing the user typed was wrong and
    // the password was NOT changed.
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "SESSION_STALE" });
  });

  it("passes a backend 400 through without parsing its prose", async () => {
    changeBackendPassword.mockResolvedValue({
      ok: false,
      kind: "rejected",
      message: "validation error: the current password is required",
    });

    const response = await POST(post({ new_password: "new-password-here" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("answers an outage as an outage", async () => {
    changeBackendPassword.mockResolvedValue({ ok: false, kind: "unavailable" });

    const response = await POST(post({ new_password: "new-password-here" }));

    expect(response.status).toBe(503);
  });
});

describe("the guards every mutating route here carries", () => {
  it("refuses a cross-origin request", async () => {
    isSameOriginRequest.mockReturnValue(false);

    const response = await POST(post({ new_password: "new-password-here" }));

    expect(response.status).toBe(403);
    expect(changeBackendPassword).not.toHaveBeenCalled();
  });

  it("answers 401 when there is genuinely no session", async () => {
    // The one legitimate 401: no session at all, which IS the redirect case.
    readActiveSession.mockResolvedValue(null);

    const response = await POST(post({ new_password: "new-password-here" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("rejects a request with no new password", async () => {
    const response = await POST(post({ current_password: "old-password" }));

    expect(response.status).toBe(400);
    expect(changeBackendPassword).not.toHaveBeenCalled();
  });
});

describe("success", () => {
  it("answers 204 with no body", async () => {
    changeBackendPassword.mockResolvedValue({ ok: true });

    const response = await POST(post({ new_password: "new-password-here" }));

    expect(response.status).toBe(204);
    await expect(response.text()).resolves.toBe("");
  });
});
