import { LoginPage } from "@/features/auth/login-page";
import { resolveAuthProviders } from "@/server/backend/auth/resolve-auth-providers";
import {
  changeEmailAction,
  credentialsSignInAction,
  requestOtpAction,
} from "@/server/auth/built-in-sign-in-actions";
import {
  abandonPasswordResetAction,
  confirmPasswordResetAction,
  requestPasswordResetAction,
} from "@/server/auth/password-reset-actions";
import { readPasswordResetBinding } from "@/server/auth/otp-nonce-cookie";
import { startOAuthDanceAction } from "@/server/auth/oauth-dance-actions";
import { safeNext } from "@/server/auth/safe-next";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; code?: string }>;
}) {
  const sp = await searchParams;
  const redirectTo = sp.next ? safeNext(sp.next) : "/";

  // Failures redirected here carry `?code=` (e.g. `signup_disabled`). `?error=`
  // is still read as a fallback for links minted before the session layer
  // replaced Auth.js, which put its own outcome there.
  const errorCode = sp.code ?? sp.error;

  /**
   * Start a provider sign-in.
   *
   * RUK-292: this no longer runs an OAuth flow. The backend owns the dance, so
   * the action stashes the destination and answers the backend's `/start` URL,
   * which the button hard-navigates to (see `startOAuthDanceAction` for why it
   * is not a `redirect()`); this app is not involved again until the receiver
   * redeems the code it comes back with. `redirectTo` is closed over here, so a client can
   * never supply a destination of its own.
   */
  async function signInAction(providerId: string): Promise<string> {
    "use server";
    return startOAuthDanceAction(providerId, redirectTo);
  }

  // Resolved server-side: `/login` sits under `(public)`, which deliberately
  // omits AppProviders (React Query, sonner) to keep the cold-start route thin,
  // so a client-side fetch has no QueryClient to run under. The resolver never
  // throws — a failure yields `undefined` methods and the page renders its
  // break-glass fallback rather than a 500.
  const providers = await resolveAuthProviders();

  // A password reset spans an email round-trip, so the user leaves this tab and
  // comes back — reload is the flow's primary re-entry, not an edge case. The
  // cookie is httpOnly and readable only here, so the step has to be resolved
  // server-side and handed down.
  //
  // ONLY the address crosses. The nonce stays in the cookie: it is httpOnly
  // precisely so browser JavaScript cannot read the binding, and passing the
  // whole binding to a client component would give that away for nothing.
  const resetBinding = await readPasswordResetBinding();

  /**
   * The built-in methods post through server actions rather than a client
   * `fetch`: Next checks a server action's Origin, the session cookie can only
   * be written on the server, and the sanitized `redirectTo` is closed over
   * here so a client can never supply a destination of its own and route
   * around `safeNext`.
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
      requestPasswordResetAction={requestPasswordResetAction}
      confirmPasswordResetAction={confirmPasswordResetAction}
      abandonPasswordResetAction={abandonPasswordResetAction}
      resetInProgressEmail={resetBinding?.email}
      resetInProgressExpiresAt={resetBinding?.expiresAt}
    />
  );
}
