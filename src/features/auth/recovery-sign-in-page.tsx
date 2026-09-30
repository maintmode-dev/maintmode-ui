"use client";

import Link from "next/link";

import { MaintMark } from "@/shared/ui/icons/brand-icons";
import { AuthScreen } from "@/features/auth/auth-screen";
import { PasswordSignInForm } from "@/features/auth/password-sign-in-form";

/**
 * `/login/recovery` — the administrator's way back in when `/login` offers
 * nothing that works for them (every built-in method switched off, no linked
 * provider).
 *
 * ## Why a separate page nobody links to
 *
 * `/login` draws only what the backend lists, and the backend stops listing
 * password sign-in once an admin switches it off. Its password endpoint still
 * accepts the server's break-glass administrator in that state — only the form
 * was gone, which is how an admin locked themselves out. Putting the form back
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
 */
export function RecoverySignInPage({
  passwordSignInAction,
}: {
  passwordSignInAction: (email: string, password: string) => Promise<{ error?: string }>;
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

      {/* No "Forgot password?": the break-glass password lives in the server's
          secrets, and a reset by email is exactly the kind of method this page
          exists to work without. */}
      <PasswordSignInForm label="Password" submit={passwordSignInAction} autoFocus />

      <Link
        href="/login"
        className="caption self-center underline-offset-4 hover:text-fg-muted hover:underline"
      >
        Back to sign-in
      </Link>
    </AuthScreen>
  );
}
