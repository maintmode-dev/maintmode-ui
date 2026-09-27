"use client";

import { AlertTriangle, ChevronRight } from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/ui/shadcn/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/ui/shadcn/tooltip";
import {
  BrandIcon,
  IntegrationBrandIcon,
  MaintMark,
  type BrandProvider,
} from "@/shared/ui/icons/brand-icons";
import { signInProviders, type SignInMethod } from "@/domain/auth/sign-in-method";
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
  /** Step two, and the password form: establishes the session. */
  otpSignInAction: (email: string, code: string) => Promise<{ error?: string }>;
  passwordSignInAction: (email: string, password: string) => Promise<{ error?: string }>;
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
 * Provider buttons come from the backend's list — every advertised `redirect`
 * method, via `signInProviders` — rather than from a table of ids this build
 * happens to know. The table is what left a configured `custom` OIDC provider
 * drawn as a disabled "coming soon" button, and GitHub as a permanent one
 * whether or not it was configured: all providers start the same backend-owned
 * dance, so nothing about drawing one is provider-specific.
 *
 * The one id-aware thing left is the brand mark, which is decoration.
 */
const BRAND_MARKS: ReadonlySet<string> = new Set<BrandProvider>(["google", "github", "microsoft", "okta"]);

function isBrandProvider(id: string): id is BrandProvider {
  return BRAND_MARKS.has(id);
}

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
  const [resetting, setResetting] = useState(Boolean(resetInProgressEmail) && offersPassword);
  const [resetDone, setResetDone] = useState(false);

  return (
    <TooltipProvider>
      <main className="min-h-screen grid place-items-center p-6 bg-bg">
        {/* `min-w-0`: a grid item defaults to `min-width: auto`, so the card
            could not shrink below its widest nowrap button — a long provider
            name pushed the page wider than a phone screen (UX-6). */}
        <div className="w-full min-w-0 max-w-[420px] space-y-6 bg-bg-elev-1 border border-border-subtle rounded-xl p-8">
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
            <div className="flex flex-col gap-4">
              {providers.length > 0 ? (
                <div className="flex flex-col gap-2.5">
                  {providers.map((p) => {
                    const label = `Continue with ${p.display_name}`;
                    return (
                      <form key={p.id} action={signInAction.bind(null, p.id)} className="contents">
                        {/* A display name is whatever the operator typed. The
                            label wraps to a second line rather than truncating
                            at once — on a phone even "Corporate SSO" did not fit
                            beside "Continue with" and the marks — and clamps
                            there, with `title` carrying the full text. */}
                        <Button
                          type="submit"
                          className="h-auto min-h-9 w-full min-w-0 justify-start gap-2.5 px-3 py-2"
                          title={label}
                          data-provider-id={p.id}
                        >
                          <ProviderMark id={p.id} />
                          <span className="min-w-0 whitespace-normal break-words text-left line-clamp-2">
                            {label}
                          </span>
                          <ChevronRight className="size-4 ml-auto" aria-hidden="true" />
                        </Button>
                      </form>
                    );
                  })}
                </div>
              ) : null}

              {providers.length > 0 && (activeForm || unsupported.length > 0) ? <OrDivider /> : null}

              {activeForm || unsupported.length > 0 ? (
                <div className="flex flex-col gap-2.5">
                  {activeForm ? (
                    <BuiltInMethod
                      key={activeForm.id}
                      method={activeForm}
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
                      className="caption underline self-center"
                      onClick={() => setActiveFormId(m.id)}
                    >
                      {SWITCH_LABELS[m.type] ?? `Use ${m.display_name} instead`}
                    </button>
                  ))}
                  {unsupported.map((m) => (
                    <UnsupportedMethodButton key={m.id} data-method-type={m.type}>
                      {m.display_name}
                    </UnsupportedMethodButton>
                  ))}
                </div>
              ) : null}
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

  return (
    <UnsupportedMethodButton data-method-type={method.type}>{method.display_name}</UnsupportedMethodButton>
  );
}

/** Separates the provider buttons from the email-based forms below them. */
function OrDivider() {
  return (
    <div className="flex items-center gap-3" role="separator" aria-label="or">
      <span className="h-px flex-1 bg-border-subtle" aria-hidden="true" />
      <span className="caption" aria-hidden="true">
        or
      </span>
      <span className="h-px flex-1 bg-border-subtle" aria-hidden="true" />
    </div>
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
    case "signup_disabled":
    case "AccessDenied":
      return "This account is not provisioned. Ask an admin for an invitation.";
    default:
      return "Sign-in didn't complete. Try again.";
  }
}

/**
 * Fixed-size white brand tile — keeps the icon column aligned across buttons.
 * A provider with no brand of its own (a `custom` OIDC IdP is whoever the
 * operator points it at) gets a neutral key rather than someone else's logo.
 */
function ProviderMark({ id }: { id: string }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-white">
      {isBrandProvider(id) ? (
        <BrandIcon name={id} size={14} />
      ) : (
        <IntegrationBrandIcon name="oidc" size={14} />
      )}
    </span>
  );
}
