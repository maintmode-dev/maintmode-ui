import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Contract test — `remember_me` on the two built-in sign-in exchanges.
 * RUK-290, SPEC §3.1, §3.2 (site 9), AC 13/14/20.
 *
 * **Why global `fetch` is stubbed rather than the shared harness.** The auth
 * exchanges do not go through `backendRequest`: `backend-token-exchange.ts` owns
 * a private `backendFetch` that calls `fetch` directly, so
 * `tests/contracts/_harness.ts` (which mocks `authenticatedBackendRequest`) has
 * nothing to intercept here. This is the same seam, and the same technique, as
 * `me-password.contract.test.ts`.
 *
 * **What this test is for.** `remember_me` is a session-length request: the user
 * ticks a box and the backend decides how long the refresh token lives. The
 * whole value of the box is that the flag *arrives*. Two failures would be
 * invisible without this test, because both leave every other test green:
 *
 *   1. the key is dropped when the box is UNTICKED — the tempting
 *      `...(rememberMe ? { remember_me: true } : {})` spread, an idiom that
 *      already lives a few functions away in this very file (see
 *      `changeBackendPassword`). Absent and `false` are the same to Go's `bool`
 *      *today*, so nothing breaks until the day the backend distinguishes them;
 *   2. the value never leaves the browser layer at all, because one of the
 *      literals along SPEC §3.2's nine-site chain was not updated. A missed
 *      site produces no type error and no runtime error — the box just silently
 *      does nothing.
 *
 * So the assertions below read the body off the `fetch` stub, never off the
 * arguments passed in, and they check `false` as carefully as `true`.
 *
 * The paths are IMPORTED, not retyped. A hardcoded `"/api/v1/login/password"`
 * would assert only itself and stay green against a wrong path — the exact trap
 * SPEC §8.1 describes.
 */

const { OTP_VERIFY_PATH, PASSWORD_LOGIN_PATH, loginWithPassword, verifyOtpCode } = await import(
  "@/server/auth/backend-token-exchange"
);

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  process.env.MAINTMODE_API_BASE_URL = "http://backend.test/maintmode";
  process.env.MAINTMODE_AUTH_API_BASE_URL = "http://backend.test/auth";
});

afterEach(() => vi.unstubAllGlobals());

/** A successful token pair, shaped as the backend sends it. */
function backendReturnsTokens() {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () =>
      JSON.stringify({ access_token: "access-1", refresh_token: "refresh-1", expires_in: 900 }),
  });
}

/** What actually went on the wire, read from the stub rather than the input. */
function wireRequest() {
  const [url, init] = fetchMock.mock.calls[0];
  return {
    url: String(url),
    body: JSON.parse(String(init.body)) as Record<string, unknown>,
  };
}

describe("password sign-in — remember_me on the wire", () => {
  it("sends remember_me: true to the password login path when the box is ticked", async () => {
    backendReturnsTokens();

    await loginWithPassword({ email: "admin@example.test", password: "hunter2", rememberMe: true });

    const { url, body } = wireRequest();
    expect(url).toContain(PASSWORD_LOGIN_PATH);
    expect(body.remember_me).toBe(true);
  });

  it("sends remember_me: false — present, not omitted — when the box is unticked", async () => {
    backendReturnsTokens();

    await loginWithPassword({ email: "admin@example.test", password: "hunter2", rememberMe: false });

    const { body } = wireRequest();
    // `toBe(false)` alone would pass on `undefined`-free JSON only by accident;
    // the `in` check is what rejects a conditional spread that drops the key.
    expect("remember_me" in body).toBe(true);
    expect(body.remember_me).toBe(false);
  });

  it("keeps the credentials it was given alongside the flag", async () => {
    backendReturnsTokens();

    await loginWithPassword({ email: "admin@example.test", password: "hunter2", rememberMe: true });

    const { body } = wireRequest();
    expect(body).toMatchObject({ email: "admin@example.test", password: "hunter2" });
  });
});

describe("OTP sign-in — remember_me on the wire", () => {
  it("sends remember_me: true to the OTP verify path when the box is ticked", async () => {
    backendReturnsTokens();

    await verifyOtpCode({
      email: "admin@example.test",
      code: "123456",
      sessionNonce: "nonce-1",
      rememberMe: true,
    });

    const { url, body } = wireRequest();
    expect(url).toContain(OTP_VERIFY_PATH);
    expect(body.remember_me).toBe(true);
  });

  it("sends remember_me: false — present, not omitted — when the box is unticked", async () => {
    backendReturnsTokens();

    await verifyOtpCode({
      email: "admin@example.test",
      code: "123456",
      sessionNonce: "nonce-1",
      rememberMe: false,
    });

    const { body } = wireRequest();
    expect("remember_me" in body).toBe(true);
    expect(body.remember_me).toBe(false);
  });

  it("keeps the bound address, code and nonce alongside the flag", async () => {
    backendReturnsTokens();

    await verifyOtpCode({
      email: "admin@example.test",
      code: "123456",
      sessionNonce: "nonce-1",
      rememberMe: false,
    });

    const { body } = wireRequest();
    expect(body).toMatchObject({
      email: "admin@example.test",
      code: "123456",
      session_nonce: "nonce-1",
    });
  });
});

describe("the two paths stay distinct", () => {
  it("does not post the password login to the OTP verify path", () => {
    // Guards against a copy-paste that would send both flows to one endpoint —
    // cheap to check, and the kind of thing a body-only assertion would miss.
    expect(PASSWORD_LOGIN_PATH).not.toBe(OTP_VERIFY_PATH);
  });
});
