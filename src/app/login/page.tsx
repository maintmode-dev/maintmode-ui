import { LoginPage } from "@/features/auth/login-page";
import { signIn } from "@/server/auth/auth-config";
import { safeNext } from "@/server/auth/safe-next";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const redirectTo = sp.next ? safeNext(sp.next) : "/";

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

  return <LoginPage error={sp.error} signInAction={signInAction} />;
}
