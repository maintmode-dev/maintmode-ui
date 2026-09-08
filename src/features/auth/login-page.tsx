"use client";

import { AlertTriangle, ChevronRight } from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/ui/shadcn/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/ui/shadcn/tooltip";
import { BrandIcon, MaintMark, type BrandProvider } from "@/shared/ui/icons/brand-icons";
import type { SignInMethod } from "@/domain/auth/sign-in-method";
import { OtpSignInFlow } from "@/features/auth/otp-sign-in-flow";
import { PasswordSignInForm } from "@/features/auth/password-sign-in-form";
// Statically imported, deliberately. It looks like a candidate for `dynamic()`
// — it is only reachable behind a click — but it can also be the FIRST thing
// this page paints: `resetInProgressEmail` resumes the flow after the user
// comes back from their email client, and a lazy chunk would turn that
// re-entry into two sequential round-trips. Its own weight is a few KB; every
// primitive it uses is already on this route.
import { PasswordResetFlow } from "@/features/auth/password-reset-flow";

export interface LoginPageProps {
  error?: string;
  /**
   * Sign-in methods the backend advertises, resolved server-side. `undefined`
   * means the providers fetch failed at the transport level — the page then
   * renders its break-glass fallback (see `BREAK_GLASS_METHODS`).
   */
  methods?: SignInMethod[];
  /**
   * Server action that starts an OAuth sign-in for the given provider id.
   * Supplied by the server page (`src/app/(public)/login/page.tsx`) so this
   * browser-owned component never imports the server auth boundary. It must
   * wrap NextAuth's `signIn` so the CSRF token is attached — a plain form POST
   * to `/api/auth/signin/<id>` omits it and fails with `MissingCSRF`.
   */
  signInAction: (providerId: string) => Promise<void>;
  /** Step one of the OTP flow: mails a code and binds it to this browser. */
  requestOtpAction: (email: string) => Promise<{ error?: string }>;
  /**
   * Step two, and the password form: establishes the session.
   *
   * `rememberMe` is required rather than optional (RUK-290). Optional would let
   * a caller omit it and feed `undefined` into a chain typed `boolean`, with no
   * compiler error anywhere along the way.
   */
  otpSignInAction: (email: string, code: string, rememberMe: boolean) => Promise<{ error?: string }>;
  passwordSignInAction: (email: string, password: string, rememberMe: boolean) => Promise<{ error?: string }>;
  /** Abandons the current OTP flow so another address can be used. */
  changeEmailAction: () => Promise<void>;
  /** Step one of the password reset (RUK-289): mails a code, binds this browser. */
  requestPasswordResetAction: (email: string) => Promise<{ error?: string }>;
  /** Step two: redeems the code, installs the password, ends every session. */
  confirmPasswordResetAction: (args: {
    email: string;
    code: string;
    newPassword: string;
  }) => Promise<{ error?: string; done?: boolean }>;
  /** Abandons the reset flow, discarding its binding. */
  abandonPasswordResetAction: () => Promise<void>;
  /**
   * Rehydrated from the reset cookie by the server page. A reset spans an email
   * round-trip, so the user WILL leave the tab and come back; without this the
   * component remounts at step one while a live binding sits on the server.
   *
   * Only the address crosses, never the nonce: the cookie is httpOnly so that
   * browser JavaScript cannot read the binding, and passing the whole thing
   * down would undo exactly that.
   */
  resetInProgressEmail?: string;
}

/**
 * The actions a backend-advertised method needs, named once so `BuiltInMethod`
 * cannot drift from the documented signatures above.
 */
type BuiltInMethodActions = Pick<
  LoginPageProps,
  "requestOtpAction" | "otpSignInAction" | "passwordSignInAction" | "changeEmailAction"
>;

/**
 * Google is rendered unconditionally, never from `methods`.
 *
 * It is not in the backend's list at all — it lives entirely in NextAuth — so
 * deriving the button list purely from `methods` would delete the Google button
 * exactly when the auth service is unreachable, i.e. remove the one method that
 * still works. (SPEC §4.2.)
 */
const OAUTH_PROVIDERS: { id: BrandProvider; label: string; enabled: boolean }[] = [
  { id: "google", label: "Continue with Google", enabled: true },
  { id: "github", label: "Continue with GitHub", enabled: false },
];

/** Provider ids owned by NextAuth above; a backend method repeating one is skipped. */
const OAUTH_IDS: ReadonlySet<string> = new Set(OAUTH_PROVIDERS.map((p) => p.id));

/**
 * What `/login` offers when the providers fetch fails at the transport level.
 * The backend guarantees its real list always contains a `password` element, so
 * this matches what a healthy fetch would have produced — and it is the
 * administrator's break-glass path when the auth service is degraded.
 */
const BREAK_GLASS_METHODS: SignInMethod[] = [
  { id: "email_password", type: "password", display_name: "Password" },
];

/** Disabled providers are gated until backend support ships. */
const COMING_SOON_TOOLTIP = "Coming soon — additional providers are on the way";

export function LoginPage({
  error,
  methods,
  signInAction,
  requestPasswordResetAction,
  confirmPasswordResetAction,
  abandonPasswordResetAction,
  resetInProgressEmail,
  ...actions
}: LoginPageProps) {
  const resolvedFailed = methods === undefined;
  const builtIn = (resolvedFailed ? BREAK_GLASS_METHODS : methods).filter((m) => !OAUTH_IDS.has(m.id));

  const offersPassword = builtIn.some((m) => m.type === "password");
  // A live binding only rehydrates if this page is still drawing the form the
  // affordance lives in. An operator who toggled password sign-in off between
  // the code being sent and the tab being reloaded gets the normal page: the
  // advertised method list is the authority on what is offered, and a cookie
  // must not resurrect a withdrawn one.
  const [resetting, setResetting] = useState(Boolean(resetInProgressEmail) && offersPassword);
  const [resetDone, setResetDone] = useState(false);

  return (
    <TooltipProvider>
      <main className="min-h-screen grid place-items-center p-6 bg-bg">
        <div className="w-full max-w-[420px] space-y-6 bg-bg-elev-1 border border-border-subtle rounded-xl p-8">
          <header className="space-y-2">
            <span
              className="flex size-8 items-center justify-center text-[var(--accent-fg)]"
              aria-hidden="true"
            >
              <MaintMark size={26} />
            </span>
            <h1 className="h2">MaintMode</h1>
            <p className="body-sm">Sign in to plan and coordinate maintenance windows.</p>
          </header>

          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2 px-3 py-2 rounded-sm bg-[var(--destructive-bg)] border border-[var(--destructive-border)] text-sm text-[var(--destructive-fg)]"
            >
              <AlertTriangle className="size-3.5 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{errorMessage(error)}</span>
            </div>
          ) : null}

          {resetDone ? (
            <div
              role="status"
              className="flex items-start gap-2 px-3 py-2 rounded-sm bg-bg-elev-2 border border-border-subtle text-sm"
            >
              <span>Password updated. Sign in with your new password.</span>
            </div>
          ) : null}

          {resetting ? (
            <PasswordResetFlow
              initialEmail={resetInProgressEmail}
              initialStep={resetInProgressEmail ? "code" : "email"}
              requestCode={requestPasswordResetAction}
              confirm={confirmPasswordResetAction}
              abandon={abandonPasswordResetAction}
              onDone={() => {
                // The backend has revoked every session and the action has torn
                // down this browser's; there is nothing to sign the user into,
                // so the flow ends where it began, with something to say.
                setResetting(false);
                setResetDone(true);
              }}
              onCancel={() => setResetting(false)}
            />
          ) : (
            <div className="flex flex-col gap-2.5">
              {OAUTH_PROVIDERS.map((p) =>
                p.enabled ? (
                  <form key={p.id} action={signInAction.bind(null, p.id)} className="contents">
                    <Button type="submit" className="w-full justify-start gap-2.5 px-3">
                      <ProviderMark id={p.id} />
                      {p.label}
                      <ChevronRight className="size-4 ml-auto" aria-hidden="true" />
                    </Button>
                  </form>
                ) : (
                  <ComingSoonButton key={p.id}>
                    <ProviderMark id={p.id} />
                    {p.label}
                  </ComingSoonButton>
                ),
              )}

              {builtIn.map((method) => (
                <BuiltInMethod
                  key={method.id}
                  method={method}
                  onForgotPassword={() => {
                    setResetDone(false);
                    setResetting(true);
                  }}
                  {...actions}
                />
              ))}
            </div>
          )}

          {resolvedFailed ? (
            <p role="status" className="caption text-center text-fg-muted">
              Some sign-in options may be unavailable right now.
            </p>
          ) : null}

          {/* "Internal tool" was true when this only ran in one company. It now
              ships as a self-hosted product, where the reader may well be the
              person who installed it. The invitation half stays: signup is
              closed by default once the first administrator exists. */}
          <p className="caption text-center">Access by invitation</p>
        </div>
      </main>
    </TooltipProvider>
  );
}

/**
 * Renders one backend-advertised method by `type`, never by `id` — `id` is a
 * machine key the backend may extend, while `type` is the closed union this
 * build knows how to draw. An unknown type reaches `redirect` and renders inert
 * rather than crashing the page or pretending to be a working way in.
 */
function BuiltInMethod({
  method,
  requestOtpAction,
  otpSignInAction,
  passwordSignInAction,
  changeEmailAction,
  onForgotPassword,
}: BuiltInMethodActions & { method: SignInMethod; onForgotPassword: () => void }) {
  if (method.type === "password") {
    return (
      <div data-method-type="password">
        <PasswordSignInForm
          label={method.display_name}
          submit={passwordSignInAction}
          onForgotPassword={onForgotPassword}
        />
      </div>
    );
  }

  if (method.type === "code") {
    return (
      <div data-method-type="code">
        <OtpSignInFlow
          label={method.display_name}
          requestCode={requestOtpAction}
          submitCode={otpSignInAction}
          onChangeEmail={changeEmailAction}
        />
      </div>
    );
  }

  return <ComingSoonButton data-method-type={method.type}>{method.display_name}</ComingSoonButton>;
}

/**
 * A gated control: rendered, disabled, and explained by the "coming soon"
 * tooltip. Used both for the OAuth providers NextAuth cannot serve yet and for
 * a backend method whose `type` this build does not know how to draw.
 */
function ComingSoonButton({ children, ...buttonProps }: React.ComponentProps<typeof Button>) {
  return (
    <Tooltip>
      {/* Disabled buttons don't emit pointer events — wrap in a span so the
          tooltip still triggers on hover/focus. */}
      <TooltipTrigger asChild>
        <span className="inline-block w-full" tabIndex={0}>
          {/* Spread first: `disabled` and the layout classes are the point of
              this component and must not be overridable by a caller. */}
          <Button
            {...buttonProps}
            variant="outline"
            className="w-full justify-start gap-2.5 px-3 pointer-events-none"
            disabled
          >
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{COMING_SOON_TOOLTIP}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Server-delivered `?code=` values only. Client-side conditions (network
 * failure, countdown expiry) are deliberately NOT mapped here — they never
 * travel as `?code=`, and merging the two maps would make the sync comment in
 * `contracts.ts` a lie. (SPEC §6.7.)
 */
function errorMessage(code: string): string {
  switch (code) {
    case "email_mismatch":
      return "This account isn't the one this invitation was sent to. Sign in with the right account.";
    case "signup_disabled":
    case "AccessDenied":
      return "This account is not provisioned. Ask an admin for an invitation.";
    default:
      return "Sign-in didn't complete. Try again.";
  }
}

/** Fixed-size white brand tile — keeps the icon column aligned across buttons. */
function ProviderMark({ id }: { id: BrandProvider }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-white">
      <BrandIcon name={id} size={14} />
    </span>
  );
}
