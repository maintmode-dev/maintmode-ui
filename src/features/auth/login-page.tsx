"use client";

import { AlertTriangle, ChevronRight } from "lucide-react";

import { Button } from "@/shared/ui/shadcn/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/ui/shadcn/tooltip";
import { BrandIcon, MaintMark, type BrandProvider } from "@/shared/ui/icons/brand-icons";

export interface LoginPageProps {
  error?: string;
  /**
   * Server action that starts an OAuth sign-in for the given provider id.
   * Supplied by the server page (`src/app/(public)/login/page.tsx`) so this
   * browser-owned component never imports the server auth boundary. It must
   * wrap NextAuth's `signIn` so the CSRF token is attached — a plain form POST
   * to `/api/auth/signin/<id>` omits it and fails with `MissingCSRF`.
   */
  signInAction: (providerId: string) => Promise<void>;
}

const PROVIDERS: { id: BrandProvider; label: string; enabled: boolean }[] = [
  { id: "google", label: "Continue with Google", enabled: true },
  { id: "github", label: "Continue with GitHub", enabled: false },
];

/** Disabled providers are gated until backend support ships. */
const COMING_SOON_TOOLTIP = "Coming soon — additional providers are on the way";

export function LoginPage({ error, signInAction }: LoginPageProps) {
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
              <span>
                {error === "email_mismatch"
                  ? "This account isn't the one this invitation was sent to. Sign in with the right account."
                  : error === "signup_disabled" || error === "AccessDenied"
                    ? "This account is not provisioned. Ask an admin for an invitation."
                    : "Sign-in didn't complete. Try again."}
              </span>
            </div>
          ) : null}

          <div className="flex flex-col gap-2.5">
            {PROVIDERS.map((p) =>
              p.enabled ? (
                <form key={p.id} action={signInAction.bind(null, p.id)} className="contents">
                  <Button type="submit" className="w-full justify-start gap-2.5 px-3">
                    <ProviderMark id={p.id} />
                    {p.label}
                    <ChevronRight className="size-4 ml-auto" aria-hidden="true" />
                  </Button>
                </form>
              ) : (
                <Tooltip key={p.id}>
                  {/* Disabled buttons don't emit pointer events — wrap in a span
                      so the "coming soon" tooltip still triggers on hover/focus. */}
                  <TooltipTrigger asChild>
                    <span className="inline-block w-full" tabIndex={0}>
                      <Button
                        variant="outline"
                        className="w-full justify-start gap-2.5 px-3 pointer-events-none"
                        disabled
                      >
                        <ProviderMark id={p.id} />
                        {p.label}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{COMING_SOON_TOOLTIP}</TooltipContent>
                </Tooltip>
              ),
            )}
          </div>

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

/** Fixed-size white brand tile — keeps the icon column aligned across buttons. */
function ProviderMark({ id }: { id: BrandProvider }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-white">
      <BrandIcon name={id} size={14} />
    </span>
  );
}
