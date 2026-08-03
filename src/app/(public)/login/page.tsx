import { LoginPage } from "@/features/auth/login-page";
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

  return <LoginPage error={errorCode} signInAction={signInAction} />;
}
