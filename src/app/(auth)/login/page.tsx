import Link from "next/link";

import { DEV_BYPASS_ENABLED, signIn } from "@/server/auth/auth-config";
import { isSafeOriginalUri } from "@/shared/config/auth-config";

// Maps both NextAuth-default `error` codes and our typed `code` values from
// `BackendExchangeError` (auth-config.ts) to operator-friendly messages.
const ERROR_MESSAGES: Record<string, string> = {
  // NextAuth default codes
  AccessDenied: "Sign-in was canceled or your account is not allowed.",
  Configuration: "Authentication is misconfigured. Contact the operator.",
  Verification: "We could not verify the sign-in request.",
  OAuthAccountNotLinked: "This Google account is not linked to a maintmode user.",
  OAuthSignInError: "Google sign-in failed. Try again.",
  OAuthCallbackError: "Google did not return a usable sign-in response.",
  CallbackRouteError: "Maintmode rejected the Google ID token. Try again.",
  CredentialsSignin: "Sign-in failed. Try again.",
  // Project-specific BackendExchangeError codes (see AUTH_ERROR_CODES)
  oauth_handoff_failed: "We could not complete the OAuth handoff with the maintmode backend.",
  identity_lookup_failed: "Authentication succeeded but the user profile could not be loaded.",
  invalid_id_token: "Google did not return an ID token. Try again.",
  session_creation_failed: "We could not create your session. Please try again.",
};

type LoginPageProps = {
  searchParams: Promise<{
    next?: string;
    error?: string;
    code?: string;
    callbackUrl?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextCandidate = params.next ?? params.callbackUrl;
  const callbackUrl = isSafeOriginalUri(nextCandidate) ? nextCandidate : "/";
  // NextAuth always emits `?error=CredentialsSignin` for our typed
  // BackendExchangeError; the precise code lives in `?code=`. Prefer it.
  const errorKey = params.code ?? params.error ?? null;
  const errorMessage = errorKey ? (ERROR_MESSAGES[errorKey] ?? "Sign-in failed.") : null;

  async function startGoogleLogin() {
    "use server";
    await signIn("google", { redirectTo: callbackUrl });
  }

  async function startDevBypassLogin() {
    "use server";
    await signIn("dev-bypass", { redirectTo: callbackUrl });
  }

  return (
    <main className="login-card" aria-labelledby="login-title">
      <header className="login-card__header">
        <Link className="brand" href="/" aria-label="Maintmode home">
          <span className="brand__mark" aria-hidden="true" />
          <span>Maintmode</span>
        </Link>
        <h1 id="login-title">Sign in</h1>
        <p>Maintmode is internal tooling. Use your work Google account to continue.</p>
      </header>

      {errorMessage ? (
        <p className="login-card__error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <form action={startGoogleLogin}>
        <button className="button button--primary" type="submit" data-testid="login-google">
          Continue with Google
        </button>
      </form>

      {DEV_BYPASS_ENABLED ? (
        <form action={startDevBypassLogin} style={{ marginTop: "0.75rem" }}>
          <button
            className="button button--secondary"
            type="submit"
            data-testid="login-dev-bypass"
          >
            Continue as dev user (no real OAuth)
          </button>
        </form>
      ) : null}

      <p className="login-card__hint">
        Sessions are short-lived. Sign in again if your access token has been revoked.
      </p>
    </main>
  );
}
