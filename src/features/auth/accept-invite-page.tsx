"use client";

import Link from "next/link";
import { AlertTriangle, Mail, RefreshCw } from "lucide-react";

import { Button } from "@/shared/ui/shadcn/button";
import { Stack } from "@/shared/ui/domain/stack";

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
   * Server action that starts the backend OAuth dance carrying the invitation.
   * Bound with the token on the server, mirroring `/login`'s `signInAction`, so
   * a client can never supply a token of its own.
   */
  acceptAction: () => Promise<void>;
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
export function AcceptInvitePage({ token, preview, acceptAction, signedInAs }: AcceptInvitePageProps) {
  return (
    <main className="min-h-screen grid place-items-center p-6 bg-bg">
      <div className="w-full max-w-[480px] bg-bg-elev-1 border border-border-subtle rounded-lg shadow-[var(--shadow-md)] p-8 space-y-5">
        {preview.status === "valid" ? (
          <ValidInvite acceptAction={acceptAction} signedInAs={signedInAs} />
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
}: Pick<AcceptInvitePageProps, "acceptAction" | "signedInAs">) {
  // ONE provider, named in one place.
  //
  // There used to be a label branch on `suggested_provider`, while the action
  // that actually starts the dance passed "google" unconditionally — so a
  // backend that ever returned "github" would have rendered a GitHub button
  // that started a Google dance. Two opinions about one question, on an auth
  // path, settled by a field the backend controls. The branch was unreachable
  // (the backend always returns null today) and is gone rather than kept for a
  // provider this app cannot start; adding a second provider means changing the
  // action and the label together, which is the point.

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
      {/*
        Signing in here means BECOMING the invited person, so an existing session
        has to go first — and the stake is higher than a wrong identity. The
        backend claims the invitation inside the dance, before this app sees the
        result, so a signed-in click would spend the invitation and leave the
        next visitor reading "already claimed". An admin opening the link to
        check it is the ordinary way that happens.

        The action refuses this case too; this is what stops the click.
      */}
      {signedInAs ? (
        <p role="status" className="caption">
          You are signed in as {signedInAs}. Sign out first, then open this invitation again.
        </p>
      ) : (
        <form action={acceptAction} className="w-full">
          <Button type="submit" className="w-full">
            Continue with Google
          </Button>
        </form>
      )}
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
