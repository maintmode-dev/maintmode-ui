"use client";

import { AlertTriangle, ArrowLeft } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/shared/ui/shadcn/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/ui/shadcn/tooltip";
import { MaintMark } from "@/shared/ui/icons/brand-icons";
import { signInProviders, type SignInMethod } from "@/domain/auth/sign-in-method";
import { AuthScreen, ProviderButton } from "@/features/auth/auth-screen";
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
   * browser-owned component never imports the server auth boundary. A server
   * action, so Next checks its Origin and the destination stays closed over on
   * the server. Resolves to the backend's `/start` URL, which the button
   * leaves for with a full navigation.
   */
  signInAction: (providerId: string) => Promise<string>;
  /** Step one of the OTP flow: mails a code and binds it to this browser. */
  requestOtpAction: (email: string) => Promise<{ error?: string; expiresAt?: number; refused?: number }>;
  /** Step two, and the password form: establishes the session. */
  otpSignInAction: (email: string, code: string) => Promise<{ error?: string }>;
  passwordSignInAction: (email: string, password: string) => Promise<{ error?: string }>;
  /** Abandons the current OTP flow so another address can be used. */
  changeEmailAction: () => Promise<void>;
  /** Step one of the password reset (RUK-289): mails a code, binds this browser. */
  requestPasswordResetAction: (
    email: string,
  ) => Promise<{ error?: string; expiresAt?: number; refused?: number }>;
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
  /** The resumed reset code's deadline (epoch ms), if the binding carries it. */
  resetInProgressExpiresAt?: number;
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
 * What `/login` offers when the providers fetch fails at the transport level.
 * The backend guarantees its real list always contains a `password` element, so
 * this matches what a healthy fetch would have produced — and it is the
 * administrator's break-glass path when the auth service is degraded.
 */
const BREAK_GLASS_METHODS: SignInMethod[] = [
  { id: "email_password", type: "password", display_name: "Password" },
];

/**
 * For a method whose `type` this build does not know — a backend newer than
 * this frontend. Visible so it is not silently missing, inert so it cannot pose
 * as a working way in.
 */
const UNSUPPORTED_TOOLTIP = "This sign-in method isn't supported by this version yet";

/**
 * `?code=` values that belong to the email-based forms (password, emailed
 * code, password reset) rather than to a provider's OAuth dance. A page that
 * arrives with one of these opens straight on the email step, since that is the
 * flow the error is about; every other code — `consent_cancelled`,
 * `email_mismatch`, `signup_disabled`, `AccessDenied`, the dance's exchange
 * failures, anything unknown — is a provider outcome and lands on the first
 * screen, next to the buttons that retry it.
 *
 * Today the built-in actions return these inline rather than through the URL,
 * so this is the defensive half: it keeps a future redirect-based failure from
 * dropping the user one click away from the form it is about. Mirrors the names
 * in `src/server/auth/contracts.ts` (`AUTH_ERROR_CODES`), which a browser module
 * may not import. The generic `credentials` code (input that never reached the
 * backend) is deliberately absent: every flow can produce it, so it does not say
 * which one failed.
 */
const BUILT_IN_ERROR_CODES: ReadonlySet<string> = new Set([
  "invalid_credentials",
  "otp_verification_failed",
  "otp_rate_limited",
  "rate_limited",
  "password_reset_failed",
  "password_reset_unavailable",
  "password_policy_violation",
]);

/** The switch between the built-in forms, worded by what it switches TO. */
const SWITCH_LABELS: Partial<Record<SignInMethod["type"], string>> = {
  code: "Email me a code instead",
  password: "Sign in with a password instead",
};

export function LoginPage({
  error,
  methods,
  signInAction,
  requestPasswordResetAction,
  confirmPasswordResetAction,
  abandonPasswordResetAction,
  resetInProgressEmail,
  resetInProgressExpiresAt,
  ...actions
}: LoginPageProps) {
  const resolvedFailed = methods === undefined;
  const providers = signInProviders(methods);
  const builtIn = (resolvedFailed ? BREAK_GLASS_METHODS : methods).filter((m) => m.type !== "redirect");
  // Password and email code both start from an email address, so drawing both
  // forms at once put two Email fields and two "Sign in" buttons on one screen.
  // One is shown, with a switch to the other; the backend's order decides which
  // comes first.
  const forms = builtIn.filter((m) => m.type === "password" || m.type === "code");
  const unsupported = builtIn.filter((m) => m.type === "unsupported");
  const [activeFormId, setActiveFormId] = useState(forms[0]?.id);
  const activeForm = forms.find((m) => m.id === activeFormId) ?? forms[0];
  const otherForms = forms.filter((m) => m !== activeForm);

  const offersPassword = builtIn.some((m) => m.type === "password");
  // A live binding only rehydrates if this page is still drawing the form the
  // affordance lives in. An operator who toggled password sign-in off between
  // the code being sent and the tab being reloaded gets the normal page: the
  // advertised method list is the authority on what is offered, and a cookie
  // must not resurrect a withdrawn one.
  //
  // Nor when the page arrived with an error (UX-11). `?code=` means a sign-in
  // just failed — an OAuth dance, a code, a password — and that is what the
  // user came here about. Resuming a reset over it drew both at once: the
  // sign-in error above and step two of a flow they were not in. The binding
  // stays; "Forgot password" resumes it.
  const [resetting, setResetting] = useState(Boolean(resetInProgressEmail) && offersPassword && !error);
  const [resetDone, setResetDone] = useState(false);
  // The binding the server handed down, for as long as it is still live. Every
  // way the flow ends discards it — "Back to sign in" abandons it, a finished
  // reset clears it — while the prop keeps naming it, so reopening the flow
  // from the prop would land on step two of a binding that is gone, where a
  // correct code is answered "wrong or has expired".
  const [resumeEmail, setResumeEmail] = useState(resetInProgressEmail);

  // The Linear-style two-step entry: providers and "Continue with email" first,
  // the email forms behind that one click. Only when there is a choice to make —
  // with no provider the form IS the page, and a step with one option in it is
  // just a delay.
  const stepped = providers.length > 0 && activeForm !== undefined;
  // Opens directly on the email step when the page arrives about that flow: a
  // reset being resumed (it lives behind "Forgot password?" on that step, and
  // backing out of it should land there), or an error from one of the forms.
  // Local state only — the URL does not carry it, and a reload of a plain
  // /login starts on the first screen.
  const [emailStep, setEmailStep] = useState(
    () => resetting || (error !== undefined && BUILT_IN_ERROR_CODES.has(error)),
  );
  // Focus moves with the step: into the email field when the user opens it (or
  // switches forms), and back to "Continue with email" on Back — never on the
  // initial render, where it would steal focus from a page the user has not
  // touched yet.
  const [focusForm, setFocusForm] = useState(false);
  const refocusContinue = useRef(false);
  // Which of the two screens renders. Without a step the forms are the page when
  // there is no provider, and the provider list is the page when there is no
  // form.
  const showForms = stepped ? emailStep : providers.length === 0;

  return (
    <TooltipProvider>
      <AuthScreen className="flex flex-col gap-6">
        <header className="flex flex-col items-center gap-4 text-center">
          <span className="text-[var(--accent-fg)]" aria-hidden="true">
            <MaintMark size={32} />
          </span>
          <h1 className="h2">Sign in to MaintMode</h1>
        </header>

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 px-3 py-2 rounded-md bg-[var(--destructive-bg)] border border-[var(--destructive-border)] text-sm text-[var(--destructive-fg)]"
          >
            <AlertTriangle className="size-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            <span>{errorMessage(error)}</span>
          </div>
        ) : null}

        {resetDone ? (
          <div
            role="status"
            className="flex items-start gap-2 px-3 py-2 rounded-md bg-bg-elev-2 border border-border-subtle text-sm"
          >
            <span>Password updated. Sign in with your new password.</span>
          </div>
        ) : null}

        {resetting ? (
          <PasswordResetFlow
            initialEmail={resumeEmail}
            initialStep={resumeEmail ? "code" : "email"}
            initialExpiresAt={resetInProgressExpiresAt}
            requestCode={requestPasswordResetAction}
            confirm={confirmPasswordResetAction}
            abandon={abandonPasswordResetAction}
            onDone={() => {
              // The backend has revoked every session and the action has torn
              // down this browser's; there is nothing to sign the user into,
              // so the flow ends where it began, with something to say.
              setResetting(false);
              setResetDone(true);
              setResumeEmail(undefined);
            }}
            onCancel={() => {
              setResetting(false);
              setResumeEmail(undefined);
            }}
          />
        ) : showForms ? (
          <div className="flex flex-col gap-3">
            {activeForm ? (
              <BuiltInMethod
                key={activeForm.id}
                method={activeForm}
                autoFocus={focusForm}
                onForgotPassword={() => {
                  setResetDone(false);
                  setResetting(true);
                }}
                {...actions}
              />
            ) : null}
            {otherForms.map((m) => (
              <button
                key={m.id}
                type="button"
                className="caption self-center underline-offset-4 hover:text-fg-muted hover:underline"
                onClick={() => {
                  setFocusForm(true);
                  setActiveFormId(m.id);
                }}
              >
                {SWITCH_LABELS[m.type] ?? `Use ${m.display_name} instead`}
              </button>
            ))}
            {/* On the stepped page the unsupported methods sit on the first
                screen with the other ways in; without a step this is the page. */}
            {stepped
              ? null
              : unsupported.map((m) => (
                  <UnsupportedMethodButton key={m.id} data-method-type={m.type}>
                    {m.display_name}
                  </UnsupportedMethodButton>
                ))}
            {stepped ? (
              <button
                type="button"
                className="caption mt-2 inline-flex items-center gap-1 self-center hover:text-fg-muted"
                onClick={() => {
                  refocusContinue.current = true;
                  setFocusForm(false);
                  setResetDone(false);
                  setEmailStep(false);
                }}
              >
                <ArrowLeft className="size-3" aria-hidden="true" />
                Back
              </button>
            ) : null}
          </div>
        ) : (
          // The first screen. The first provider the backend lists is the one
          // filled button; every other way in — the rest of the providers,
          // "Continue with email", a method this build cannot draw — is outline.
          <div className="flex flex-col gap-2">
            {providers.map((p, i) => (
              <ProviderButton
                key={p.id}
                provider={p}
                action={signInAction.bind(null, p.id)}
                primary={i === 0}
              />
            ))}
            {activeForm ? (
              <Button
                ref={(el) => {
                  if (el && refocusContinue.current) {
                    refocusContinue.current = false;
                    el.focus();
                  }
                }}
                type="button"
                variant="outline"
                size="lg"
                data-step="continue-with-email"
                onClick={() => {
                  setFocusForm(true);
                  setEmailStep(true);
                }}
              >
                Continue with email
              </Button>
            ) : null}
            {unsupported.map((m) => (
              <UnsupportedMethodButton key={m.id} data-method-type={m.type}>
                {m.display_name}
              </UnsupportedMethodButton>
            ))}
          </div>
        )}

        <footer className="flex flex-col items-center gap-2 text-center">
          {resolvedFailed ? (
            <p role="status" className="caption text-fg-muted">
              Some sign-in options may be unavailable right now.
            </p>
          ) : null}

          {/* "Internal tool" was true when this only ran in one company. It now
              ships as a self-hosted product, where the reader may well be the
              person who installed it. The invitation half stays: signup is
              closed by default once the first administrator exists. */}
          <p className="caption">Access by invitation</p>
        </footer>
      </AuthScreen>
    </TooltipProvider>
  );
}

/**
 * Renders one built-in method by `type`, never by `id` — `id` is a machine key
 * the backend may extend, while `type` is the closed union this build knows how
 * to draw. Providers (`redirect`) are drawn above as buttons and never reach
 * here; an `unsupported` type renders inert rather than crashing the page or
 * pretending to be a working way in.
 */
function BuiltInMethod({
  method,
  requestOtpAction,
  otpSignInAction,
  passwordSignInAction,
  changeEmailAction,
  onForgotPassword,
  autoFocus,
}: BuiltInMethodActions & { method: SignInMethod; onForgotPassword: () => void; autoFocus: boolean }) {
  if (method.type === "password") {
    return (
      <div data-method-type="password">
        <PasswordSignInForm
          label={method.display_name}
          submit={passwordSignInAction}
          onForgotPassword={onForgotPassword}
          autoFocus={autoFocus}
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
          autoFocus={autoFocus}
        />
      </div>
    );
  }

  return (
    <UnsupportedMethodButton data-method-type={method.type}>{method.display_name}</UnsupportedMethodButton>
  );
}

/**
 * A gated control: rendered, disabled, and explained by a tooltip. Used for a
 * backend method whose `type` this build does not know how to draw.
 */
function UnsupportedMethodButton({ children, ...buttonProps }: React.ComponentProps<typeof Button>) {
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
            size="lg"
            className="w-full justify-start gap-2.5 px-3 pointer-events-none"
            disabled
          >
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{UNSUPPORTED_TOOLTIP}</TooltipContent>
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
    case "consent_cancelled":
      // The person's own Cancel at the provider (UX-10) — nothing is wrong
      // with their account, so nothing here should suggest it.
      return "Sign-in was cancelled. Choose a way to sign in to try again.";
    case "signup_disabled":
    case "AccessDenied":
      return "This account is not provisioned. Ask an admin for an invitation.";
    default:
      return "Sign-in didn't complete. Try again.";
  }
}
