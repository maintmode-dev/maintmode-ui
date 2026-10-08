import { beforeEach, describe, expect, it, vi } from "vitest";

import { BackendAuthError } from "@/server/auth/contracts";

const runBuiltInSignIn = vi.fn();
const runDanceRedemption = vi.fn();
const exchangeGoogleIdToken = vi.fn();
const fetchBackendMe = vi.fn();
const establishSession = vi.fn();
const devBypass = vi.hoisted(() => ({ enabled: true }));

vi.mock("@/server/auth/built-in-sign-in", async () => {
  const actual = await vi.importActual<typeof import("@/server/auth/built-in-sign-in")>(
    "@/server/auth/built-in-sign-in",
  );
  return { ...actual, runBuiltInSignIn: (...args: unknown[]) => runBuiltInSignIn(...args) };
});
vi.mock("@/server/auth/oauth-dance-redemption", async () => {
  const actual = await vi.importActual<typeof import("@/server/auth/oauth-dance-redemption")>(
    "@/server/auth/oauth-dance-redemption",
  );
  return { ...actual, runDanceRedemption: (...args: unknown[]) => runDanceRedemption(...args) };
});
vi.mock("@/server/auth/backend-token-exchange", () => ({
  exchangeGoogleIdToken: (...args: unknown[]) => exchangeGoogleIdToken(...args),
  fetchBackendMe: (...args: unknown[]) => fetchBackendMe(...args),
}));
vi.mock("@/server/auth/session-token", () => ({
  establishSession: (...args: unknown[]) => establishSession(...args),
}));
vi.mock("@/server/auth/dev-bypass", () => ({
  get DEV_BYPASS_ENABLED() {
    return devBypass.enabled;
  },
}));

const { BuiltInSignInError } = await import("@/server/auth/built-in-sign-in");
const { OAuthDanceError } = await import("@/server/auth/oauth-dance-redemption");
const { signInWithBackendLogin, signInWithDanceCode, signInWithDevBypass } =
  await import("@/server/auth/sign-in");

const PAIR = { access_token: "at", refresh_token: "rt", expires_in: 900 };
const USER = { id: "u-1", email: "a@example.test", displayName: "A", roles: ["admin"] };

/** Makes the mocked exchange fill the account the way the real one does. */
function exchangeSucceeds(mock: ReturnType<typeof vi.fn>) {
  mock.mockImplementation(async (account: { maintmodeTokens?: unknown; maintmodeUser?: unknown }) => {
    account.maintmodeTokens = PAIR;
    account.maintmodeUser = USER;
    return true;
  });
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code ?? "NO-CODE";
  }
  return "RESOLVED";
}

beforeEach(() => {
  vi.clearAllMocks();
  devBypass.enabled = true;
  establishSession.mockResolvedValue(undefined);
});

/**
 * What used to be the `backend-login` Credentials provider: a shape check that
 * never spends a backend attempt, then the exchange, then the session.
 */
describe("signInWithBackendLogin", () => {
  it("signs in with an email code and writes the session the exchange produced", async () => {
    exchangeSucceeds(runBuiltInSignIn);

    await signInWithBackendLogin({ kind: "otp", email: " a@example.test ", code: "123456" });

    expect(runBuiltInSignIn).toHaveBeenCalledWith(expect.anything(), {
      signInKind: "otp",
      email: "a@example.test",
      otpCode: "123456",
    });
    expect(establishSession).toHaveBeenCalledWith(PAIR, USER);
  });

  // The backend allows five attempts per code before burning it; a value that
  // cannot win must not spend one.
  it.each([
    ["a malformed code", { kind: "otp", email: "a@example.test", code: "12ab" }],
    ["no email", { kind: "password", email: " ", password: "pw" }],
    ["no password", { kind: "password", email: "a@example.test", password: "" }],
    ["an unknown kind", { kind: "magic", email: "a@example.test" }],
    ["an invitation without a token", { kind: "invite", password: "pw" }],
  ])("refuses %s before reaching the backend", async (_label, credentials) => {
    expect(await codeOf(signInWithBackendLogin(credentials))).toBe("credentials");
    expect(runBuiltInSignIn).not.toHaveBeenCalled();
    expect(establishSession).not.toHaveBeenCalled();
  });

  it("accepts break-glass on a password alone, and an invitation with no email", async () => {
    exchangeSucceeds(runBuiltInSignIn);

    await signInWithBackendLogin({ kind: "break-glass", password: "pw" });
    await signInWithBackendLogin({ kind: "invite", invitation: "tok", password: "pw" });

    expect(runBuiltInSignIn).toHaveBeenNthCalledWith(1, expect.anything(), {
      signInKind: "break-glass",
      password: "pw",
    });
    expect(runBuiltInSignIn).toHaveBeenNthCalledWith(2, expect.anything(), {
      signInKind: "invite",
      invitationToken: "tok",
      password: "pw",
    });
  });

  it("carries the exchange's own failure code out, and writes no session", async () => {
    runBuiltInSignIn.mockRejectedValue(new BuiltInSignInError("otp_rate_limited"));

    expect(
      await codeOf(signInWithBackendLogin({ kind: "otp", email: "a@example.test", code: "123456" })),
    ).toBe("otp_rate_limited");
    expect(establishSession).not.toHaveBeenCalled();
  });

  // A pair with no refresh token used to sign the user in and die at the first
  // rotation; now the sign-in itself says it did not complete.
  it("reports a session it could not establish instead of succeeding", async () => {
    exchangeSucceeds(runBuiltInSignIn);
    establishSession.mockRejectedValue(new Error("token pair cannot sustain a session"));

    expect(
      await codeOf(signInWithBackendLogin({ kind: "password", email: "a@example.test", password: "pw" })),
    ).toBe("identity_lookup_failed");
  });
});

describe("signInWithDanceCode", () => {
  it("redeems the code with this browser's proof and writes the session", async () => {
    exchangeSucceeds(runDanceRedemption);

    await signInWithDanceCode(" one-time ", "nonce-1");

    expect(runDanceRedemption).toHaveBeenCalledWith(expect.anything(), "one-time", "nonce-1");
    expect(establishSession).toHaveBeenCalledWith(PAIR, USER);
  });

  it.each([
    ["an empty code", "", "nonce"],
    ["no proof", "code", ""],
  ])("does not spend the code with %s", async (_label, code, proof) => {
    expect(await codeOf(signInWithDanceCode(code, proof))).toBe("oauth_handoff_failed");
    expect(runDanceRedemption).not.toHaveBeenCalled();
  });

  it("carries the redemption's failure code out", async () => {
    runDanceRedemption.mockRejectedValue(new OAuthDanceError("identity_lookup_failed"));

    expect(await codeOf(signInWithDanceCode("code", "nonce"))).toBe("identity_lookup_failed");
    expect(establishSession).not.toHaveBeenCalled();
  });
});

describe("signInWithDevBypass", () => {
  it("exchanges the dev placeholder with the role and writes the session", async () => {
    exchangeGoogleIdToken.mockResolvedValue(PAIR);
    fetchBackendMe.mockResolvedValue({
      id: "u-1",
      email: "a@example.test",
      display_name: "A",
      roles: ["admin"],
    });

    await signInWithDevBypass("admin");

    expect(exchangeGoogleIdToken).toHaveBeenCalledWith("dev-bypass", "admin");
    expect(establishSession).toHaveBeenCalledWith(PAIR, USER);
  });

  it("does nothing at all when the bypass is off", async () => {
    devBypass.enabled = false;

    expect(await codeOf(signInWithDevBypass("admin"))).toBe("credentials");
    expect(exchangeGoogleIdToken).not.toHaveBeenCalled();
  });

  it("refuses a role that is not one of ours before the backend sees it", async () => {
    expect(await codeOf(signInWithDevBypass("root"))).toBe("credentials");
    expect(exchangeGoogleIdToken).not.toHaveBeenCalled();
  });

  it("tells closed signup apart from any other exchange failure, and both from a profile failure", async () => {
    exchangeGoogleIdToken.mockRejectedValueOnce(new BackendAuthError(403, '{"code":"signup_disabled"}'));
    expect(await codeOf(signInWithDevBypass("admin"))).toBe("signup_disabled");

    exchangeGoogleIdToken.mockRejectedValueOnce(new BackendAuthError(500, "boom"));
    expect(await codeOf(signInWithDevBypass("admin"))).toBe("oauth_handoff_failed");

    exchangeGoogleIdToken.mockResolvedValueOnce(PAIR);
    fetchBackendMe.mockRejectedValueOnce(new Error("me down"));
    expect(await codeOf(signInWithDevBypass("admin"))).toBe("identity_lookup_failed");
  });
});
