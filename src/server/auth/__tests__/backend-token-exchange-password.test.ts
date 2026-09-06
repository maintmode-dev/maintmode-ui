import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  changeBackendPassword,
  confirmPasswordReset,
  requestPasswordResetCode,
} from "@/server/auth/backend-token-exchange";

/**
 * The password HTTP client, executed rather than mocked.
 *
 * Every other suite in this change stubs this module, which left its 401
 * classification — the single most consequential branch in RUK-289 — provable
 * only by reading it. An inverted classification tells an operator with a wrong
 * password that their session expired, and an operator with a dead session that
 * their password is wrong on a form with no password field.
 *
 * Assertions read the REQUEST off the fetch stub, not the arguments object, so
 * they pin what actually goes on the wire.
 */

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  process.env.MAINTMODE_API_BASE_URL = "http://backend.test/maintmode";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function respond(status: number, body = "") {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `status ${status}`,
    text: async () => body,
  };
}

/** The JSON body of the Nth fetch call. */
function sentBody(call = 0): Record<string, unknown> {
  return JSON.parse(fetchMock.mock.calls[call][1].body);
}

describe("changeBackendPassword — the 401 classification", () => {
  // The inversion of this pair is invisible to every other test in the change,
  // and it is the failure SPEC §3.4 exists to prevent.
  it("reads a 401 as a wrong password when a current password was sent", async () => {
    fetchMock.mockResolvedValue(respond(401, '{"code":"unauthorized"}'));

    const outcome = await changeBackendPassword({
      accessToken: "access-1",
      currentPassword: "wrong",
      newPassword: "a-long-enough-password",
      refreshToken: "refresh-1",
    });

    expect(outcome).toEqual({ ok: false, kind: "wrong-current-password" });
  });

  it("reads a 401 as a stale session when none was sent", async () => {
    fetchMock.mockResolvedValue(respond(401, '{"code":"unauthorized"}'));

    const outcome = await changeBackendPassword({
      accessToken: "access-1",
      newPassword: "a-long-enough-password",
      refreshToken: "stale-refresh",
    });

    // Nothing the user typed was wrong, and the backend changed nothing.
    expect(outcome).toEqual({ ok: false, kind: "session-stale" });
  });

  it("maps 204, 400 and everything else", async () => {
    fetchMock.mockResolvedValueOnce(respond(204));
    await expect(
      changeBackendPassword({ accessToken: "a", newPassword: "a-long-enough-password" }),
    ).resolves.toEqual({ ok: true });

    fetchMock.mockResolvedValueOnce(respond(400, "validation error: length policy"));
    await expect(
      changeBackendPassword({ accessToken: "a", newPassword: "a-long-enough-password" }),
    ).resolves.toEqual({ ok: false, kind: "rejected", message: "validation error: length policy" });

    fetchMock.mockResolvedValueOnce(respond(503, "gateway down"));
    await expect(
      changeBackendPassword({ accessToken: "a", newPassword: "a-long-enough-password" }),
    ).resolves.toEqual({ ok: false, kind: "unavailable" });
  });

  // A 200 or 202 is not success here: the contract is 204 with an empty body,
  // and treating any 2xx as done would report a password change the backend
  // never made.
  it("treats a 2xx that is not 204 as unavailable", async () => {
    fetchMock.mockResolvedValue(respond(200, "{}"));

    await expect(
      changeBackendPassword({ accessToken: "a", newPassword: "a-long-enough-password" }),
    ).resolves.toEqual({ ok: false, kind: "unavailable" });
  });

  it("treats a thrown fetch as unavailable rather than propagating", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    await expect(
      changeBackendPassword({ accessToken: "a", newPassword: "a-long-enough-password" }),
    ).resolves.toEqual({ ok: false, kind: "unavailable" });
  });
});

describe("changeBackendPassword — what goes on the wire", () => {
  it("sends the refresh token, which is what keeps the caller signed in", async () => {
    fetchMock.mockResolvedValue(respond(204));

    await changeBackendPassword({
      accessToken: "access-1",
      currentPassword: "old-password",
      newPassword: "a-long-enough-password",
      refreshToken: "refresh-1",
    });

    // Omitting it makes the backend revoke every session including this one:
    // the operator is signed out by their own success.
    expect(sentBody()).toEqual({
      current_password: "old-password",
      new_password: "a-long-enough-password",
      refresh_token: "refresh-1",
    });
  });

  it("omits current_password as a KEY when the account has none", async () => {
    fetchMock.mockResolvedValue(respond(204));

    await changeBackendPassword({
      accessToken: "access-1",
      newPassword: "a-long-enough-password",
      refreshToken: "refresh-1",
    });

    // Absent, not empty: the backend rejects the field outright for an account
    // with no password, so `""` would 400 every set-password call.
    expect("current_password" in sentBody()).toBe(false);
  });

  it("omits refresh_token as a key when there is none to send", async () => {
    fetchMock.mockResolvedValue(respond(204));

    await changeBackendPassword({ accessToken: "a", newPassword: "a-long-enough-password" });

    expect("refresh_token" in sentBody()).toBe(false);
  });

  it("carries the access token as a bearer credential", async () => {
    fetchMock.mockResolvedValue(respond(204));

    await changeBackendPassword({ accessToken: "access-1", newPassword: "a-long-enough-password" });

    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe("Bearer access-1");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/v1/me/password");
  });
});

describe("confirmPasswordReset", () => {
  // Without the throw, EVERY reset failure resolves — the caller reports
  // success, the user is told their password changed and is signed out, and the
  // password is unchanged.
  it("throws on a failure rather than resolving", async () => {
    fetchMock.mockResolvedValue(respond(401, '{"code":"otp_session_mismatch"}'));

    await expect(
      confirmPasswordReset({
        email: "op@example.test",
        code: "123456",
        sessionNonce: "nonce-1",
        newPassword: "a-long-enough-password",
      }),
    ).rejects.toMatchObject({ status: 401, responseBody: '{"code":"otp_session_mismatch"}' });
  });

  it("resolves on 204", async () => {
    fetchMock.mockResolvedValue(respond(204));

    await expect(
      confirmPasswordReset({
        email: "op@example.test",
        code: "123456",
        sessionNonce: "nonce-1",
        newPassword: "a-long-enough-password",
      }),
    ).resolves.toBeUndefined();
  });

  it("sends the nonce under the key the backend reads", async () => {
    fetchMock.mockResolvedValue(respond(204));

    await confirmPasswordReset({
      email: "op@example.test",
      code: "123456",
      sessionNonce: "nonce-1",
      newPassword: "a-long-enough-password",
    });

    // Named explicitly: a renamed or empty `session_nonce` is answered with the
    // same opaque 401 as a wrong code, so nothing downstream could tell.
    expect(sentBody()).toEqual({
      email: "op@example.test",
      code: "123456",
      session_nonce: "nonce-1",
      new_password: "a-long-enough-password",
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/v1/password/reset/confirm");
  });
});

describe("requestPasswordResetCode", () => {
  it("returns the session nonce from a 202", async () => {
    fetchMock.mockResolvedValue(respond(202, '{"session_nonce":"nonce-1"}'));

    await expect(requestPasswordResetCode("op@example.test")).resolves.toEqual({
      session_nonce: "nonce-1",
    });
    expect(sentBody()).toEqual({ email: "op@example.test" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/v1/password/reset/request");
  });

  it("rejects a 202 that carries no nonce, rather than binding undefined", async () => {
    fetchMock.mockResolvedValue(respond(202, "{}"));

    await expect(requestPasswordResetCode("op@example.test")).rejects.toThrow();
  });

  it("throws with the status on a rate limit", async () => {
    fetchMock.mockResolvedValue(respond(429, "slow down"));

    await expect(requestPasswordResetCode("op@example.test")).rejects.toMatchObject({ status: 429 });
  });
});
