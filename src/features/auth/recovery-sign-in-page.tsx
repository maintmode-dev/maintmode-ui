"use client";

import Link from "next/link";
import { useState } from "react";

import { MaintMark } from "@/shared/ui/icons/brand-icons";
import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";
import { Label } from "@/shared/ui/shadcn/label";
import { AuthScreen } from "@/features/auth/auth-screen";
import { flowErrorMessage } from "@/features/auth/otp-sign-in-flow";
import { isRouterNavigation } from "@/features/auth/router-navigation";

/**
 * `/login/recovery` — the administrator's way back in when `/login` offers
 * nothing that works for them (every built-in method switched off, no linked
 * provider).
 *
 * ## Why a separate page nobody links to
 *
 * `/login` draws only what the backend lists, and the backend stops listing
 * password sign-in once an admin switches it off. Break-glass is not one of
 * those methods — it has its own endpoint, which answers whatever is switched
 * off — but its form was gone, which is how an admin locked themselves out. Putting the form back
 * on `/login` would show it to everyone and undo the switch, so it lives here:
 * the Authentication settings show this address to admins, `/login` never links
 * to it, and search engines are told not to index it.
 *
 * Grafana keeps its equivalent (`/login?disableAutoLogin`) in the docs only and
 * has had to fix it twice for losing the query parameter on redirects; a route
 * of its own cannot be lost that way.
 *
 * ## Why it always looks the same
 *
 * The page renders the same form whatever the instance is configured with, and
 * a failure reads the same as a wrong password on `/login`. The address is not a
 * secret — the backend's password check is the control — and the page must not
 * answer "does this deployment have a break-glass account?" either: the backend
 * deliberately keeps that unanswerable from outside.
 *
 * ## Why only a password
 *
 * Break-glass signs in by password alone (`POST /login/break-glass`): the
 * emergency account is a fixed service identity, so an email field would only
 * be one more thing to get wrong at the worst possible moment.
 */
export function RecoverySignInPage({
  breakGlassSignInAction,
}: {
  breakGlassSignInAction: (password: string) => Promise<{ error?: string }>;
}) {
  return (
    <AuthScreen className="flex flex-col gap-6">
      <header className="flex flex-col items-center gap-4 text-center">
        <span className="text-[var(--accent-fg)]" aria-hidden="true">
          <MaintMark size={32} />
        </span>
        <h1 className="h2">Administrator sign-in</h1>
        <p className="body-sm text-fg-muted">
          For the server&apos;s break-glass administrator when the usual sign-in methods are turned off.
        </p>
      </header>

      <BreakGlassForm submit={breakGlassSignInAction} />

      <Link
        href="/login"
        className="caption self-center underline-offset-4 hover:text-fg-muted hover:underline"
      >
        Back to sign-in
      </Link>
    </AuthScreen>
  );
}

/**
 * The break-glass password, and nothing else. No "Forgot password?": the
 * password lives in the server's secrets, and a reset by email is exactly the
 * kind of method this page exists to work without.
 */
function BreakGlassForm({ submit }: { submit: (password: string) => Promise<{ error?: string }> }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!password || pending) return;

    setPending(true);
    setError(undefined);
    try {
      const result = await submit(password);
      setPending(false);
      if (result.error) setError(result.error);
    } catch (thrown) {
      // A successful sign-in redirects, and Next rejects the action's promise
      // while it navigates — stay on "Signing in…" until the page goes.
      if (isRouterNavigation(thrown)) return;
      setPending(false);
      setError("unexpected");
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="break-glass-password">Break-glass password</Label>
        <Input
          className="h-10"
          id="break-glass-password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby={error ? "break-glass-error" : undefined}
        />
      </div>
      {error ? (
        <p id="break-glass-error" role="alert" className="text-xs text-[var(--destructive-fg)]">
          {breakGlassErrorMessage(error)}
        </p>
      ) : null}
      <Button size="lg" type="submit" disabled={!password || pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

/**
 * "Password", not "email or password": there is no email here. Every refusal
 * reads the same — the backend answers one 401 for all of them on purpose.
 */
function breakGlassErrorMessage(code: string): string {
  return code === "invalid_credentials" ? "That password isn't right." : flowErrorMessage(code);
}
