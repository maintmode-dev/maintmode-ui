import { AlertTriangle } from "lucide-react";

import { Button } from "@/shared/ui/shadcn/button";

export interface LoginPageProps {
  next?: string;
  error?: string;
}

const PROVIDERS = [
  { id: "google", label: "Continue with Google", enabled: true },
  { id: "github", label: "Continue with GitHub", enabled: false },
  { id: "microsoft", label: "Continue with Microsoft", enabled: false },
  { id: "okta", label: "Continue with Okta", enabled: false },
];

export function LoginPage({ next, error }: LoginPageProps) {
  return (
    <main className="min-h-screen grid place-items-center p-6 bg-bg">
      <div className="w-full max-w-[400px] space-y-6 bg-bg-elev-1 border border-border-subtle rounded-lg p-8">
        <header className="space-y-2">
          <div
            className="size-8 rounded-sm bg-accent-soft border border-[var(--accent)]/40"
            aria-hidden="true"
          />
          <h1 className="h2">Sign in to MaintMode</h1>
          <p className="body-sm">
            Use your work account. We don&apos;t store passwords — sign-in goes through your provider.
          </p>
        </header>

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 px-3 py-2 rounded-sm bg-[var(--destructive-bg)] border border-[var(--destructive-border)] text-sm text-[var(--destructive-fg)]"
          >
            <AlertTriangle className="size-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              {error === "AccessDenied"
                ? "This account is not provisioned. Ask an admin for an invitation."
                : "Sign-in didn't complete. Try again."}
            </span>
          </div>
        ) : null}

        <div className="space-y-2">
          {PROVIDERS.map((p) => (
            <form key={p.id} action={`/api/auth/signin/${p.id}`} method="post" className="contents">
              {next ? <input type="hidden" name="callbackUrl" value={next} /> : null}
              <Button
                type="submit"
                variant={p.enabled ? "default" : "outline"}
                className="w-full justify-center"
                disabled={!p.enabled}
              >
                {p.label}
                {!p.enabled ? <span className="text-xs text-fg-dim ml-2">soon</span> : null}
              </Button>
            </form>
          ))}
        </div>

        <p className="caption text-center">
          Additional providers ship with RUK-92. Need access? Ask your administrator for an invite.
        </p>
      </div>
    </main>
  );
}
