"use client";

import Link from "next/link";
import { useState } from "react";

import { isPasswordWithinPolicy } from "@/domain/auth/sign-in-method";
import { isRouterNavigation } from "@/features/auth/router-navigation";
import { Button } from "@/shared/ui/shadcn/button";
import { Label } from "@/shared/ui/shadcn/label";
import { PasswordInput } from "@/shared/ui/domain/password-input";

/**
 * Accepting an invitation by setting a password — the way in for someone whose
 * organisation runs no identity provider, or who would rather not use it.
 *
 * One field. The address comes from the invitation on the server, so there is
 * nothing to type that could disagree with it — and the page's frozen tone keeps
 * the invited address off screen anyway. No confirm field: `PasswordInput`
 * lets the person see what they typed, which catches the same typo for less.
 */
export function InvitePasswordForm({
  submit,
}: {
  /** Closed over the invitation token on the server; the form never sees it. */
  submit: (password: string) => Promise<{ error?: string }>;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!password || pending) return;
    // Checked here as well as on the server so a short password is answered
    // without spending a request against the invitation endpoints' limiter.
    if (!isPasswordWithinPolicy(password)) {
      setError("password_policy_violation");
      return;
    }

    setPending(true);
    setError(undefined);
    try {
      const result = await submit(password);
      setPending(false);
      if (result.error) setError(result.error);
    } catch (thrown) {
      // A successful accept redirects, and Next rejects the action's promise
      // while it navigates — stay on "Accepting…" until the page goes.
      if (isRouterNavigation(thrown)) return;
      setPending(false);
      setError("invite_accept_failed");
    }
  }

  return (
    <form className="flex w-full flex-col gap-3 text-left" onSubmit={onSubmit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-password">Create a password</Label>
        <PasswordInput
          className="h-10"
          id="invite-password"
          name="new-password"
          autoComplete="new-password"
          value={password}
          disabled={pending}
          onChange={(e) => {
            setPassword(e.target.value);
            if (error === "password_policy_violation") setError(undefined);
          }}
          aria-describedby={error ? "invite-password-error invite-password-hint" : "invite-password-hint"}
        />
        {/* "Characters" rather than bytes: the policy is 12 BYTES, which is not
            a unit anyone counts in; for the scripts people type it is at least
            12 characters, never more. */}
        <p id="invite-password-hint" className="caption">
          At least 12 characters.
        </p>
      </div>
      {error ? (
        <p id="invite-password-error" role="alert" className="text-xs text-[var(--destructive-fg)]">
          {inviteErrorMessage(error)}
          {error === "account_exists" || error === "identity_lookup_failed" ? (
            <>
              {" "}
              <Link href="/login" className="underline underline-offset-2">
                Go to sign-in
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      <Button size="lg" type="submit" disabled={!password || pending}>
        {pending ? "Accepting…" : "Accept invitation"}
      </Button>
    </form>
  );
}

/**
 * Each refusal asks the person for something different, so each is worded on
 * its own. None of them names the invited address or its roles (the page's
 * frozen tone), and none reveals more than the invitation already tells its
 * holder.
 */
export function inviteErrorMessage(code: string): string {
  switch (code) {
    case "password_policy_violation":
      return "Use at least 12 characters.";
    case "invitation_invalid":
      return "This invitation can no longer be used. Ask whoever invited you to send a new one.";
    case "method_disabled":
      return "Password sign-in is turned off on this instance. Ask an administrator, or use another way in if one is offered.";
    case "seats_limit_exceeded":
      return "There are no free seats on this instance. Ask an administrator to free one, then try again.";
    case "account_exists":
      return "An account with this email already exists — sign in instead.";
    case "invite_rate_limited":
      return "Too many attempts. Wait a moment and try again.";
    // The backend accepted: the account exists, the password is set and the
    // invitation is spent — only loading the profile failed. "Try again" would
    // send the person back into an invitation that now answers "invalid".
    case "identity_lookup_failed":
      return "Your account is ready, but we couldn't sign you in. Sign in with your new password.";
    default:
      return "Something went wrong. Try again.";
  }
}
