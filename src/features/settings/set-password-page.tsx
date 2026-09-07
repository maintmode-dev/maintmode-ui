"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useMeQuery } from "@/features/_shared/queries/use-me-query";
import { PasswordCard } from "@/features/settings/password-card";
import { Skeleton } from "@/shared/ui/domain/skeleton";

/**
 * A focused page for setting a first password (RUK-289), reached from the
 * profile card. Renders the same form in a bare centered layout rather than
 * inside `AppShell`, so there is one thing on the screen to do.
 *
 * **The redirect is client-side, and that is forced rather than preferred.**
 * A server component cannot read the session here: `readActiveSession()`
 * refreshes and writes cookies when the access token is near expiry, and Next
 * permits a cookie write only inside a Server Action or Route Handler — a page
 * render throws `ReadonlyRequestCookiesError`. Building it server-side would
 * therefore 500 only inside the rotation window: green tests, intermittent
 * production failure.
 *
 * The cost is a brief render before the redirect. It is acceptable because the
 * page is reached deliberately from the profile card, so arriving in the wrong
 * state is rare, and because the form is inert until submitted.
 */
export function SetPasswordPage() {
  const router = useRouter();
  const meQuery = useMeQuery();
  const passwordSet = meQuery.data?.password_set;

  // `true` means they are not who this page is for; `undefined` means the
  // backend cannot say, and the card would offer nothing anyway. Both belong on
  // the profile, where the rest of the account lives.
  const shouldLeave = meQuery.isSuccess && passwordSet !== false;

  useEffect(() => {
    if (shouldLeave) {
      router.replace("/settings/profile");
    }
  }, [shouldLeave, router]);

  return (
    <main className="min-h-screen grid place-items-center p-6 bg-bg">
      <div className="w-full max-w-[420px] space-y-6 bg-bg-elev-1 border border-border-subtle rounded-xl p-8">
        <header className="space-y-2">
          <h1 className="h2">Set a password</h1>
          <p className="body-sm">
            Add a password so you can sign in with your email address as well as your current method.
          </p>
        </header>

        {meQuery.isPending || shouldLeave ? (
          // Shaped like the form it stands in for, not a fixed block. The page
          // is `grid place-items-center`, so a height change on swap
          // re-centres the whole card and visibly moves the heading above it —
          // a placeholder of the wrong height guarantees that on every load.
          //
          // Also covers the moment between deciding to leave and the navigation
          // landing, so the form never flashes at someone on their way out.
          <div className="flex flex-col gap-2.5" aria-hidden="true">
            <Skeleton type="row" width={110} />
            <Skeleton type="block" className="h-9" />
            <Skeleton type="row" width="70%" />
            <Skeleton type="block" className="h-9 w-36" />
          </div>
        ) : meQuery.isError ? (
          // Distinct from the card's own "this deployment doesn't report
          // password state" copy. Both would otherwise render here — an errored
          // query leaves `password_set` undefined — and blaming a version gap
          // for a transient outage is the §3.6 conflation this change avoids
          // everywhere else.
          <p role="alert" className="caption text-fg-muted">
            Couldn&apos;t load your account just now. Reload to try again.
          </p>
        ) : (
          <PasswordCard passwordSet={passwordSet} />
        )}
      </div>
    </main>
  );
}
