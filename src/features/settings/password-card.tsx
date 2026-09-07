"use client";

import { useState } from "react";
import { toast } from "sonner";

import { isPasswordWithinPolicy } from "@/domain/auth/sign-in-method";
import { BffError } from "@/features/_shared/api/bff-fetch";
import { useChangePassword } from "@/features/_shared/queries/use-me-query";
import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";
import { Label } from "@/shared/ui/shadcn/label";

/**
 * Set or change the account password (RUK-289).
 *
 * Which form is drawn comes from `password_set`, which has THREE meaningful
 * values (SPEC §2.4):
 *
 *  - `true`    — change: current password + new password.
 *  - `false`   — set: new password only. Sending a current password for an
 *                account with none is a 400, so the field must not be there.
 *  - `undefined` — the deployed backend predates the field. Nothing is
 *                offered, because guessing either form makes every save a 400.
 */

export interface PasswordCardProps {
  /** `me.password_set`. `undefined` is "unknown", never "false". */
  passwordSet: boolean | undefined;
}

export function PasswordCard({ passwordSet }: PasswordCardProps) {
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | undefined>();

  /**
   * A `password_set` that disagrees with reality is possible: the backend
   * answers `false` when its own read of the credential fails. The wrong guess
   * is answered with a 400, and the form flips to the other shape so the user
   * is not stuck.
   *
   * Once, and only once. A 400 is NOT evidence about `password_set` — the same
   * status also carries a length-policy failure, and all three of the backend's
   * 400s share one code — so an unbounded rule would oscillate between the two
   * forms forever.
   *
   * `null` means "no flip has happened, follow the prop".
   */
  const [flipTo, setFlipTo] = useState<boolean | null>(null);

  /**
   * Which shape the form is in: the prop, unless a flip has overridden it.
   *
   * DERIVED, not seeded into state. A `useState(passwordSet === true)`
   * initializer runs only on mount, and this card is never remounted — so
   * setting a password left `password_set` flipping to `true` on the wire while
   * the form still offered "Set password". The next submit then omitted
   * `current_password` and earned a 400 the user had done nothing to deserve.
   * Caught against a live backend; no test could see it, because every test
   * mounts the component fresh.
   */
  const asChange = flipTo ?? passwordSet === true;
  const flipped = flipTo !== null;

  if (passwordSet === undefined) {
    return (
      <p className="caption text-fg-muted">
        Password management is unavailable — this deployment doesn&apos;t report password state yet.
      </p>
    );
  }

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (change.isPending) return;

    // Checked before sending so a length failure is never attributed to the
    // wrong thing by the flip rule below. Bytes, not characters: the backend
    // measures with Go's `len()`.
    if (!isPasswordWithinPolicy(next)) {
      setError("Choose a longer password — at least 12 characters.");
      return;
    }
    setError(undefined);

    change.mutate(
      { ...(asChange ? { current_password: current } : {}), new_password: next },
      {
        onSuccess: () => {
          toast.success(asChange ? "Password changed" : "Password set");
          setCurrent("");
          setNext("");
        },
        onError: (mutationError) => {
          if (!(mutationError instanceof BffError)) {
            toast.error("Couldn't save your password. Try again.");
            return;
          }

          if (mutationError.status === 422) {
            setError("That current password isn't right.");
            return;
          }
          if (mutationError.status === 409) {
            // Nothing the user typed was wrong, and nothing was changed.
            toast.error("Your session expired before the change was saved. Sign in again.");
            return;
          }
          if (mutationError.status === 400 && !flipped) {
            // The password passed the local length check, so this 400 is the
            // shape being wrong for this account's real state. Flip once.
            setFlipTo(!asChange);
            setCurrent("");
            setError(
              asChange
                ? "This account has no password yet — set one below."
                : "This account already has a password — enter your current one.",
            );
            return;
          }
          setError(mutationError.message || "Couldn't save your password. Try again.");
        },
      },
    );
  };

  return (
    <form className="flex flex-col gap-2.5" onSubmit={onSubmit}>
      {asChange ? (
        <>
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            name="current-password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </>
      ) : null}

      <Label htmlFor="new-password">New password</Label>
      <Input
        id="new-password"
        name="new-password"
        type="password"
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        aria-describedby="new-password-hint"
      />
      {/*
       * "Characters" rather than bytes. The policy is 12 BYTES, which is not a
       * unit to show an operator; the ASCII worst case can only under-promise,
       * so a non-ASCII password shorter than the hint is still accepted.
       */}
      <p id="new-password-hint" className="caption">
        At least 12 characters. {asChange ? "Changing it signs you out of your other devices." : null}
      </p>

      {error ? (
        <p role="alert" className="text-xs text-[var(--destructive-fg)]">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={change.isPending || !next || (asChange && !current)}>
          {change.isPending ? "Saving…" : asChange ? "Change password" : "Set password"}
        </Button>
        {!asChange ? (
          // The page is the same form on its own, for someone who came here to
          // do this one thing. It is this card's only entry point.
          <a href="/set-password" className="caption underline">
            Open on its own page
          </a>
        ) : null}
      </div>
    </form>
  );
}
