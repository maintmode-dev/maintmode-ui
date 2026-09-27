"use client";

import Link from "next/link";
import { AlertTriangle, Mail, RefreshCw } from "lucide-react";

import { Button } from "@/shared/ui/shadcn/button";
import { Stack } from "@/shared/ui/domain/stack";

import type { SignInMethod } from "@/domain/auth/sign-in-method";

import type { InviteStatus, SuggestedProvider } from "./invitation-preview-types";

export interface AcceptInvitePageProps {
  token?: string;
  /**
   * Invitation preview resolved on the server by
   * `src/server/backend/invitations/resolve-invitation-preview.ts` and passed
   * down as a prop. Resolving server-side removes a client round-trip and the
   * loading skeleton, and it is what keeps this public route free of any
   * React Query dependency — the page must render without a
   * `QueryClientProvider` (see `accept-invite-no-query-provider.test.tsx`).
   */
  preview: InvitationPreviewResult;
  /**
   * Server action that starts the backend OAuth dance for one provider,
   * carrying the invitation. The token is closed over on the server, mirroring
   * `/login`'s `signInAction`, so a client can never supply a token of its own.
   */
  acceptAction: (providerId: string) => Promise<void>;
  /**
   * The providers to offer, resolved on the server (`signInProviders`): every
   * one the backend advertises, or the Google fallback when the list could not
   * be read. Empty means none is configured.
   *
   * Its own prop rather than a widened `preview.status`: "your invitation is
   * bad" and "our sign-in is down" are different messages to a person holding a
   * valid invite, and folding them together would tell the wrong one. And it
   * cannot be resolved here — this component is `"use client"` and may not
   * import from `src/server/**`.
   *
   * Unlike `/login` there is no break-glass to fall back to: an invitation is
   * only acceptable through the dance, so a page with no provider has nothing
   * else to offer.
   */
  providers: SignInMethod[];
  /**
   * The signed-in visitor's own email, when there is a session. Not the invited
   * address — the frozen tone forbids surfacing that, and this is a fact about
   * whoever is holding the browser.
   */
  signedInAs?: string;
}

export interface InvitationPreviewResult {
  status: InviteStatus | "unknown_error";
  suggested_provider?: SuggestedProvider | string;
}

/**
 * Frozen tone: NEVER surface email or roles in error states. Preview exposes
 * only `status` and (when valid) `suggested_provider`; everything else is a
 * single recovery-first explanation.
 */
export function AcceptInvitePage({
  token,
  preview,
  acceptAction,
  signedInAs,
  providers,
}: AcceptInvitePageProps) {
  return (
    <main className="min-h-screen grid place-items-center p-6 bg-bg">
      {/* `min-w-0`, as on /login: a grid item cannot otherwise shrink below its
          widest nowrap button. */}
      <div className="w-full min-w-0 max-w-[480px] bg-bg-elev-1 border border-border-subtle rounded-lg shadow-[var(--shadow-md)] p-8 space-y-5">
        {preview.status === "valid" ? (
          <ValidInvite acceptAction={acceptAction} signedInAs={signedInAs} providers={providers} />
        ) : (
          <InvalidInvite status={preview.status} token={token} />
        )}
      </div>
    </main>
  );
}

function ValidInvite({
  acceptAction,
  signedInAs,
  providers,
}: Pick<AcceptInvitePageProps, "acceptAction" | "signedInAs" | "providers">) {
  // Each button's label and the provider its action starts come from the SAME
  // list entry, so they cannot disagree.
  //
  // They once did: a label branch on `suggested_provider` sat beside an action
  // that passed "google" unconditionally, so a backend returning "github" would
  // have rendered a GitHub button that started a Google dance. This component
  // names no provider of its own for that reason.

  // Centered composition — consistent with the error/terminal states' stack.
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <header className="flex flex-col items-center gap-2">
        <span
          className="flex size-9 items-center justify-center rounded-full bg-accent-soft text-[var(--accent-fg)]"
          aria-hidden="true"
        >
          <Mail className="size-4" />
        </span>
        <h1 className="h2">You&apos;ve been invited</h1>
      </header>
      <p className="body-sm">Sign in with the email this invitation was sent to.</p>
      <InviteCallToAction acceptAction={acceptAction} signedInAs={signedInAs} providers={providers} />
    </div>
  );
}

/**
 * The one interactive slot on a valid invite: the accept button, or the reason
 * there isn't one. Three mutually exclusive states, read top to bottom in
 * order of precedence — a session blocks the dance outright, and a missing
 * provider blocks it even without one.
 */
function InviteCallToAction({
  acceptAction,
  signedInAs,
  providers,
}: Pick<AcceptInvitePageProps, "acceptAction" | "signedInAs" | "providers">) {
  // Signing in here means BECOMING the invited person, so an existing session
  // has to go first — and the stake is higher than a wrong identity. The
  // backend claims the invitation inside the dance, before this app sees the
  // result, so a signed-in click would spend the invitation and leave the next
  // visitor reading "already claimed". An admin opening the link to check it is
  // the ordinary way that happens.
  //
  // The action refuses this case too; this is what stops the click.
  if (signedInAs) {
    return (
      <p role="status" className="caption">
        You are signed in as {signedInAs}. Sign out first, then open this invitation again.
      </p>
    );
  }

  // No provider is configured, so the dance would answer a JSON error instead
  // of a redirect and drop the invitee on raw backend output on another origin.
  // A button is worse than no button here.
  //
  // The reassurance is not padding: the backend refuses before minting any
  // state, so the invitation is untouched and the link still works. Shown an
  // explanation with no button, an invitee would otherwise reasonably conclude
  // they had just spent it.
  if (providers.length === 0) {
    return (
      <p role="status" className="caption">
        Sign-in isn&apos;t set up on this instance yet, so this invitation can&apos;t be accepted right now.
        Your invitation is still valid — ask an administrator to finish setup, then open this link again.
      </p>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2.5">
      {providers.map((p) => {
        const label = `Continue with ${p.display_name}`;
        return (
          <form key={p.id} action={acceptAction.bind(null, p.id)} className="w-full">
            <Button
              type="submit"
              className="h-auto min-h-9 w-full min-w-0 py-2"
              title={label}
              data-provider-id={p.id}
            >
              <span className="min-w-0 whitespace-normal break-words line-clamp-2">{label}</span>
            </Button>
          </form>
        );
      })}
    </div>
  );
}

function InvalidInvite({
  status,
  token,
}: {
  status: Exclude<InviteStatus, "valid"> | "unknown_error";
  /** Present only so the retry link can re-request the same invite. */
  token?: string;
}) {
  const copy: Record<typeof status, { title: string; body: string }> = {
    invalid: {
      title: "Invalid invitation link",
      body: "This link can't be used. Ask whoever invited you to send a new one.",
    },
    expired: {
      title: "This invitation has expired",
      body: "Ask your administrator to send a fresh invitation.",
    },
    revoked: {
      title: "This invitation has been revoked",
      body: "Reach out to your administrator for a new one.",
    },
    accepted: {
      title: "This invitation has already been claimed",
      body: "If this wasn't you, contact your administrator.",
    },
    missing: {
      title: "Invitation link is incomplete",
      body: "Open the original link from the email you received.",
    },
    unknown_error: {
      title: "We couldn't verify this invitation",
      body: "The server didn't respond. Try again in a moment.",
    },
  };
  const c = copy[status];

  // Centered icon-stack (mirrors empty-states). `unknown_error` is the only
  // retryable state — it offers Try again; every other terminal/error state
  // offers the single recovery route off this public page: Go to login.
  //
  // The preview now resolves on the server, so retrying means re-requesting the
  // page (which re-runs the resolve) rather than refetching a client query. The
  // token is carried through so the retry targets the same invite.
  return (
    <Stack
      className="py-4"
      icon={<AlertTriangle aria-hidden="true" />}
      title={c.title}
      caption={c.body}
      cta={
        status === "unknown_error" && token ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/accept-invite?token=${encodeURIComponent(token)}`} prefetch={false}>
              <RefreshCw className="size-3.5" aria-hidden="true" /> Try again
            </Link>
          </Button>
        ) : (
          <Button asChild variant="outline" size="sm">
            <Link href="/login">Go to login</Link>
          </Button>
        )
      }
    />
  );
}
