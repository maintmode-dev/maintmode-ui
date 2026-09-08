import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * RUK-290 — the `remember_me` chain, and the four places it dies quietly.
 * SPEC §3.2, AC 15 and AC 16.
 *
 * The flag crosses nine sites between the checkbox and the wire, and five of
 * them are literals rather than types: the `signIn(...)` call object, the
 * provider's `credentials` declaration, both `return`s in `authorize`, and both
 * exchange call objects in `runBuiltInSignIn`. Widening a signature never forces
 * a literal to pass the new field, so a missed site yields **no type error and
 * no runtime error** — the box just silently stops working, for everyone, and
 * looks exactly like a user who never ticked it.
 *
 * That is why the parser test below is not enough on its own and AC 16 exists:
 * `authorize`'s parsing can be perfect while the value never reaches it. The
 * two halves of this file are deliberate — one proves the decision, the other
 * proves the delivery.
 */

// ---------------------------------------------------------------------------
// AC 15 — fail-closed parsing, and the declaration that lets it run at all.
// ---------------------------------------------------------------------------

/**
 * Two sites here can only be read as source text: `auth-config.ts` cannot be
 * imported outside the Next runtime (NextAuth resolves `next/server` at module
 * load), which is why `backend-login-provider.test.ts` guards the same file the
 * same way. The *decision* is not among them — `parseRememberMe` lives in its
 * own NextAuth-free module precisely so it can be called.
 */
const authConfigSource = readFileSync(join(process.cwd(), "src/server/auth/auth-config.ts"), "utf8");

describe("AC 15 — the flag is declared, and parsed fail-closed", () => {
  it("declares rememberMe among the provider's credentials", () => {
    // Site 5. NextAuth forwards only declared keys, so without this line the
    // value never reaches `authorize` and every other test here still passes.
    // Source text is the only option; `[\s\S]` rather than `[^\n]` so that
    // reformatting the object across lines is not a failure.
    expect(authConfigSource).toMatch(/credentials:\s*\{[\s\S]{0,200}?\brememberMe:\s*\{\}/);
  });

  it("calls the shared parser rather than re-deriving the comparison inline", () => {
    // Keeps the behavioural test below meaningful: an inline re-implementation
    // in `authorize` would sit outside everything `parse-remember-me.test.ts`
    // checks.
    expect(authConfigSource).toContain("parseRememberMe(credentials?.rememberMe)");
  });

  it("puts the parsed flag on both returned users, not just one", () => {
    // Site 6 again: an OTP-only fix is the easy half-miss, and it leaves
    // password sign-in silently unable to ask for a long session.
    const authorizeStart = authConfigSource.indexOf("async authorize(credentials)");
    const authorizeEnd = authConfigSource.indexOf("}),\n);", authorizeStart);
    const body = authConfigSource.slice(authorizeStart, authorizeEnd);

    const otpBranch = body.indexOf('signInKind: "otp" as const');
    const passwordBranch = body.indexOf('signInKind: "password" as const');
    expect(otpBranch).toBeGreaterThan(-1);
    expect(passwordBranch).toBeGreaterThan(-1);

    // One `rememberMe,` after each branch marker.
    expect(body.slice(otpBranch, passwordBranch)).toContain("rememberMe,");
    expect(body.slice(passwordBranch)).toContain("rememberMe,");
  });
});

// ---------------------------------------------------------------------------
// AC 16 — end-to-end: the value actually reaches the exchange.
// ---------------------------------------------------------------------------

const verifyOtpCode = vi.fn();
const loginWithPassword = vi.fn();
const fetchBackendMe = vi.fn();
const readOtpBinding = vi.fn();
const clearOtpBinding = vi.fn();

vi.mock("@/server/auth/backend-token-exchange", () => ({
  verifyOtpCode: (...args: unknown[]) => verifyOtpCode(...args),
  loginWithPassword: (...args: unknown[]) => loginWithPassword(...args),
  fetchBackendMe: (...args: unknown[]) => fetchBackendMe(...args),
  exchangeGoogleIdToken: vi.fn(),
  acceptInvitation: vi.fn(),
  refreshBackendToken: vi.fn(),
}));

vi.mock("@/server/auth/otp-nonce-cookie", () => ({
  readOtpBinding: () => readOtpBinding(),
  clearOtpBinding: () => clearOtpBinding(),
  setOtpBinding: vi.fn(),
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
}));

const { runBuiltInSignIn } = await import("@/server/auth/built-in-sign-in");

function callSignIn(user: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return runBuiltInSignIn({ provider: "backend-login" } as any, user as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  const tokens = { access_token: "a", refresh_token: "r", expires_in: 900 };
  verifyOtpCode.mockResolvedValue(tokens);
  loginWithPassword.mockResolvedValue(tokens);
  fetchBackendMe.mockResolvedValue({
    id: "u1",
    email: "admin@example.test",
    display_name: "Admin",
    roles: ["admin"],
  });
  readOtpBinding.mockResolvedValue({ email: "admin@example.test", nonce: "nonce-1" });
});

describe("AC 16 — the ticked box reaches the exchange", () => {
  it("passes rememberMe: true through the password branch", async () => {
    await callSignIn({
      signInKind: "password",
      email: "admin@example.test",
      password: "pw",
      rememberMe: true,
    });

    expect(loginWithPassword).toHaveBeenCalledWith(expect.objectContaining({ rememberMe: true }));
  });

  it("passes rememberMe: true through the OTP branch", async () => {
    await callSignIn({ signInKind: "otp", email: "admin@example.test", otpCode: "123456", rememberMe: true });

    expect(verifyOtpCode).toHaveBeenCalledWith(expect.objectContaining({ rememberMe: true }));
  });

  it("passes an explicit false when the box was left unticked", async () => {
    await callSignIn({
      signInKind: "password",
      email: "admin@example.test",
      password: "pw",
      rememberMe: false,
    });

    expect(loginWithPassword).toHaveBeenCalledWith(expect.objectContaining({ rememberMe: false }));
  });

  it("normalises a missing flag to false rather than passing undefined on", async () => {
    // `interface User` has to keep the field optional — Google and dev-bypass
    // share that type and return no such field — so `undefined` genuinely can
    // arrive here. It must not travel further: `JSON.stringify` drops undefined
    // keys, which would turn "unticked" into "absent" on the wire.
    await callSignIn({ signInKind: "password", email: "admin@example.test", password: "pw" });

    expect(loginWithPassword).toHaveBeenCalledWith(expect.objectContaining({ rememberMe: false }));
    const [args] = loginWithPassword.mock.calls[0] as [Record<string, unknown>];
    expect(args.rememberMe).not.toBeUndefined();
  });
});
