import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RUK-290 — the two `"use server"` wrappers in `login/page.tsx` actually forward
 * `rememberMe`. SPEC §3.2 site 2.
 *
 * **Why this file exists.** Ship review mutated both wrappers to pass a literal
 * `rememberMe: false` and the entire gate stayed green — 219 contract tests,
 * 1466 unit tests and `tsc` all silent — while the checkbox stopped working on
 * both sign-in methods at once. That is the widest silent failure in the change
 * and, until this file, the only one nothing covered.
 *
 * SPEC §3.2 lists site 2 as "not silent" because widening a signature breaks its
 * callers. True for *adding* the parameter; useless against *bypassing* it
 * afterwards, which is the shape a regression actually takes. `false` satisfies
 * `boolean`, so the compiler has nothing to say.
 *
 * Nothing else reaches these wrappers: the four `LoginPage` component tests pass
 * inert stubs (`otpSignInAction={async () => ({})}`) because they are testing
 * the component, not the page that composes it. The chain is proven from the
 * checkbox down to `credentialsSignInAction`, and from `credentialsSignInAction`
 * to the wire — this is the joint between those two halves.
 *
 * The page is an async server component, so it is invoked as a function and its
 * returned element inspected for the props it hands down. The wrappers are then
 * called directly, which is what a submitting form does.
 */

/** The shape `credentialsSignInAction` receives; only `rememberMe` is asserted. */
type SignInInput = {
  kind: "otp" | "password";
  email: string;
  code?: string;
  password?: string;
  rememberMe: boolean;
  next?: string;
};

const credentialsSignInAction = vi.fn<(input: SignInInput) => Promise<{ error?: string }>>();

vi.mock("@/server/auth/built-in-sign-in-actions", () => ({
  credentialsSignInAction: (input: SignInInput) => credentialsSignInAction(input),
  requestOtpAction: vi.fn(async () => ({})),
  changeEmailAction: vi.fn(async () => {}),
}));

vi.mock("@/server/auth/password-reset-actions", () => ({
  requestPasswordResetAction: vi.fn(async () => ({})),
  confirmPasswordResetAction: vi.fn(async () => ({})),
  abandonPasswordResetAction: vi.fn(async () => {}),
}));

vi.mock("@/server/auth/otp-nonce-cookie", () => ({
  readPasswordResetBinding: vi.fn(async () => undefined),
}));

vi.mock("@/server/auth/auth-config", () => ({ signIn: vi.fn(async () => {}) }));

vi.mock("@/server/backend/auth/resolve-auth-providers", () => ({
  resolveAuthProviders: vi.fn(async () => ({ ok: true, methods: [] })),
}));

// The page renders <LoginPage/>; the element's props are the subject here, so
// the component itself is replaced by a marker that keeps them inspectable.
vi.mock("@/features/auth/login-page", () => ({ LoginPage: () => null }));

const Page = (await import("@/app/(public)/login/page")).default;

type SignInProps = {
  otpSignInAction: (email: string, code: string, rememberMe: boolean) => Promise<{ error?: string }>;
  passwordSignInAction: (email: string, password: string, rememberMe: boolean) => Promise<{ error?: string }>;
};

/** Invokes the server component and returns the props it hands to LoginPage. */
async function signInProps(): Promise<SignInProps> {
  const element = await Page({ searchParams: Promise.resolve({}) });
  return (element as unknown as { props: SignInProps }).props;
}

beforeEach(() => {
  credentialsSignInAction.mockReset();
  credentialsSignInAction.mockResolvedValue({});
});

/** What the action actually received, read from the mock rather than the input. */
function actionArg(): SignInInput {
  const [first] = credentialsSignInAction.mock.calls;
  expect(first).toBeDefined();
  return first![0];
}

describe("login page — the sign-in wrappers forward the remember-me choice", () => {
  it.each([true, false])("passes rememberMe %s through the password wrapper", async (choice) => {
    const { passwordSignInAction } = await signInProps();

    await passwordSignInAction("admin@example.test", "hunter2", choice);

    expect(actionArg()).toMatchObject({ kind: "password", rememberMe: choice });
  });

  it.each([true, false])("passes rememberMe %s through the OTP wrapper", async (choice) => {
    const { otpSignInAction } = await signInProps();

    await otpSignInAction("admin@example.test", "123456", choice);

    expect(actionArg()).toMatchObject({ kind: "otp", rememberMe: choice });
  });

  it("still forwards the credentials alongside the flag", async () => {
    // Guards against a wrapper that satisfies the assertions above by passing
    // the flag and dropping something else.
    const { passwordSignInAction } = await signInProps();

    await passwordSignInAction("admin@example.test", "hunter2", true);

    expect(actionArg()).toMatchObject({ email: "admin@example.test", password: "hunter2" });
  });
});
