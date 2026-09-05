import { LoginPage } from "@/features/auth/login-page";
import { resolveAuthProviders } from "@/server/backend/auth/resolve-auth-providers";
import {
  changeEmailAction,
  credentialsSignInAction,
  requestOtpAction,
} from "@/server/auth/built-in-sign-in-actions";
import { signIn } from "@/server/auth/auth-config";
import { safeNext } from "@/server/auth/safe-next";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; code?: string }>;
}) {
  const sp = await searchParams;
  const redirectTo = sp.next ? safeNext(sp.next) : "/";

  // NextAuth sets `?code=<our BackendExchangeError code>` alongside the generic
  // `?error=CredentialsSignin`. Prefer the granular code so /login can render a
  // precise message (e.g. `signup_disabled`), falling back to `?error=` for
  // NextAuth's own outcomes (`AccessDenied`, etc.).
  const errorCode = sp.code ?? sp.error;

  /**
   * Start an OAuth sign-in via the NextAuth v5 `signIn` server action. Defined
   * here (server page) — not inside the browser-owned LoginPage component —
   * because the auth boundary lives in `src/server/**`. Using `signIn` lets
   * NextAuth attach the CSRF token itself; a plain HTML form POST to
   * `/api/auth/signin/<id>` omits it and fails with `MissingCSRF`.
   */
  async function signInAction(providerId: string) {
    "use server";
    await signIn(providerId, { redirectTo });
  }

  // Resolved server-side: `/login` sits under `(public)`, which deliberately
  // omits AppProviders (React Query, sonner) to keep the cold-start route thin,
  // so a client-side fetch has no QueryClient to run under. The resolver never
  // throws — a failure yields `undefined` methods and the page renders its
  // break-glass fallback rather than a 500.
  const providers = await resolveAuthProviders();

  /**
   * The built-in methods post through server actions rather than a client
   * `fetch`: NextAuth attaches its CSRF token only when `signIn` runs on the
   * server, and the sanitized `redirectTo` is closed over here so a client can
   * never supply a destination of its own and route around `safeNext`.
   */
  async function otpSignInAction(email: string, code: string) {
    "use server";
    return credentialsSignInAction({ kind: "otp", email, code, next: redirectTo });
  }

  async function passwordSignInAction(email: string, password: string) {
    "use server";
    return credentialsSignInAction({ kind: "password", email, password, next: redirectTo });
  }

  return (
    <LoginPage
      error={errorCode}
      methods={providers.ok ? providers.methods : undefined}
      signInAction={signInAction}
      requestOtpAction={requestOtpAction}
      otpSignInAction={otpSignInAction}
      passwordSignInAction={passwordSignInAction}
      changeEmailAction={changeEmailAction}
    />
  );
}
