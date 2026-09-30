import type { Metadata } from "next";

import { RecoverySignInPage } from "@/features/auth/recovery-sign-in-page";
import { credentialsSignInAction } from "@/server/auth/built-in-sign-in-actions";

/** Not a page to be found by searching — admins get the address from Authentication settings. */
export const metadata: Metadata = {
  title: "Administrator sign-in",
  robots: { index: false, follow: false },
};

/**
 * Break-glass sign-in, rendered independently of what `/login` lists — see
 * `recovery-sign-in-page.tsx`.
 *
 * The destination is fixed rather than read from `?next=`: this page is reached
 * by typing its address, never by a redirect that would have one to carry, so
 * accepting a query-supplied destination would add an open parameter for
 * nothing. The action goes through the same `credentialsSignInAction` as
 * `/login`'s password form, so NextAuth's CSRF token and the uniform
 * "wrong email or password" answer come with it.
 */
export default function Page() {
  async function passwordSignInAction(email: string, password: string) {
    "use server";
    return credentialsSignInAction({ kind: "password", email, password, next: "/" });
  }

  return <RecoverySignInPage passwordSignInAction={passwordSignInAction} />;
}
