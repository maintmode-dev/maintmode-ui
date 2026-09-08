import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loginWithPassword, requestOtpCode, verifyOtpCode } from "@/server/auth/backend-token-exchange";
import { AUTH_ERROR_CODES, BackendAuthError } from "@/server/auth/contracts";

/**
 * RUK-288 — the built-in sign-in exchange (email OTP + email/password).
 *
 * Covers what the backend contract actually guarantees, so a change on either
 * side shows up here rather than as a login page that silently stops working.
 */

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let fetchMock: FetchMock;

beforeEach(() => {
  process.env.MAINTMODE_API_BASE_URL = "http://backend.test/maintmode";
  process.env.MAINTMODE_AUTH_API_BASE_URL = "http://backend.test/auth";
  process.env.MAINTMODE_API_TIMEOUT_MS = "5000";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("requestOtpCode", () => {
  it("posts the address to the OTP request endpoint on the auth base", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(202, { session_nonce: "nonce-abc" }));

    const result = await requestOtpCode("someone@example.test");

    expect(result.session_nonce).toBe("nonce-abc");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://backend.test/auth/api/v1/login/otp/request");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ email: "someone@example.test" });
  });

  it("treats an unknown address exactly like a known one", async () => {
    // The backend answers 202 with a placeholder nonce for addresses that have
    // no account, deliberately, so nothing here may branch on it.
    fetchMock.mockResolvedValueOnce(jsonResponse(202, { session_nonce: "placeholder-nonce" }));

    await expect(requestOtpCode("nobody@example.test")).resolves.toEqual({
      session_nonce: "placeholder-nonce",
    });
  });
});

describe("verifyOtpCode", () => {
  it("sends the code together with the binding held by this browser", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 }),
    );

    await verifyOtpCode({ email: "a@example.test", code: "123456", sessionNonce: "nonce-1" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://backend.test/auth/api/v1/login/otp/verify");
    expect(JSON.parse(String(init?.body))).toEqual({
      email: "a@example.test",
      code: "123456",
      session_nonce: "nonce-1",
    });
  });

  it("accepts a token pair without a refresh token", async () => {
    // `refresh_token` carries `omitempty` on this endpoint, so requiring it
    // (as the Google path does) would reject a valid response.
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { access_token: "at-only", expires_in: 3600 }));

    await expect(
      verifyOtpCode({ email: "a@example.test", code: "123456", sessionNonce: "n" }),
    ).resolves.toMatchObject({ access_token: "at-only" });
  });

  it("surfaces the backend's lost-binding code distinctly from a wrong code", async () => {
    // This distinction is the reason RUK-288 exists: the two must not converge.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { code: "otp_session_mismatch", message: "request a new code" }),
    );

    await expect(
      verifyOtpCode({ email: "a@example.test", code: "123456", sessionNonce: "stale" }),
    ).rejects.toBeInstanceOf(BackendAuthError);

    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { code: "unauthorized", message: "authentication failed" }),
    );

    const wrongCode = await verifyOtpCode({
      email: "a@example.test",
      code: "000000",
      sessionNonce: "good",
    }).catch((e: unknown) => e);

    expect(wrongCode).toBeInstanceOf(BackendAuthError);
    expect((wrongCode as BackendAuthError).responseBody).toContain("unauthorized");
    expect((wrongCode as BackendAuthError).responseBody).not.toContain("otp_session_mismatch");
  });
});

describe("loginWithPassword", () => {
  it("posts to the password endpoint with no trailing slash", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { access_token: "at-2", refresh_token: "rt-2", expires_in: 3600 }),
    );

    await loginWithPassword({ email: "admin@example.test", password: "hunter2" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://backend.test/auth/api/v1/login/password");
    expect(JSON.parse(String(init?.body))).toEqual({
      email: "admin@example.test",
      password: "hunter2",
    });
  });

  it("raises the backend's uniform 401 without inventing a reason", async () => {
    // The backend refuses to say which of wrong-password / blocked / refused
    // signup / seats-exhausted occurred, so that a caller cannot enumerate.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { code: "unauthorized", message: "authentication failed" }),
    );

    const error = await loginWithPassword({
      email: "admin@example.test",
      password: "wrong",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BackendAuthError);
    expect((error as BackendAuthError).status).toBe(401);
  });
});

describe("AUTH_ERROR_CODES — the codes /login renders from", () => {
  it("carries a lost-binding code separate from a failed verification", () => {
    // If these ever collapse to one value, a user with a correct code in a
    // reopened tab gets told the code is wrong, which is the exact defect this
    // ticket exists to remove.
    expect(AUTH_ERROR_CODES.otpSessionMismatch).toBe("otp_session_mismatch");
    expect(AUTH_ERROR_CODES.otpVerificationFailed).toBe("otp_verification_failed");
    expect(AUTH_ERROR_CODES.otpSessionMismatch).not.toBe(AUTH_ERROR_CODES.otpVerificationFailed);
  });

  it("names both fields in a password failure rather than one", () => {
    expect(AUTH_ERROR_CODES.invalidCredentials).toBe("invalid_credentials");
  });
});
