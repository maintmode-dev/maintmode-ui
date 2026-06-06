"use client";

import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";

import { Button } from "@/shared/ui/shadcn/button";
import { Skeleton } from "@/shared/ui/domain/skeleton";

import {
  type InviteStatus,
  type SuggestedProvider,
  useInvitationPreview,
} from "./queries/use-invitation-preview";

export interface AcceptInvitePageProps {
  token?: string;
}

/**
 * Frozen tone: NEVER surface email or roles in error states. Preview exposes
 * only `status` and (when valid) `suggested_provider`; everything else is a
 * single recovery-first explanation.
 */
export function AcceptInvitePage({ token }: AcceptInvitePageProps) {
  const query = useInvitationPreview(token);

  return (
    <main className="min-h-screen grid place-items-center p-6 bg-bg">
      <div className="w-full max-w-[440px] bg-bg-elev-1 border border-border-subtle rounded-lg p-8 space-y-5">
        <header className="space-y-2">
          <div
            className="size-8 rounded-sm bg-accent-soft border border-[var(--accent)]/40"
            aria-hidden="true"
          />
          <h1 className="h2">Accept invitation</h1>
        </header>

        {query.isPending ? (
          <Skeleton type="block" />
        ) : query.isError ? (
          <InvalidInvite status="unknown_error" onRetry={() => query.refetch()} />
        ) : query.data.status === "valid" ? (
          <ValidInvite token={token} suggestedProvider={query.data.suggested_provider} />
        ) : (
          <InvalidInvite status={query.data.status} />
        )}
      </div>
    </main>
  );
}

function ValidInvite({
  token,
  suggestedProvider,
}: {
  token?: string;
  suggestedProvider?: SuggestedProvider;
}) {
  // MVP wires Google only (RUK-92 adds the rest). The backend currently always
  // returns null for suggested_provider, so this defaults to Google.
  const provider = suggestedProvider ?? "google";
  const label = provider === "github" ? "Continue with GitHub" : "Continue with Google";
  const googleOnly = provider !== "google";

  return (
    <>
      <div className="flex items-start gap-2 px-3 py-2 rounded-sm bg-[var(--status-completed-bg)] border border-[var(--status-completed-border)] text-sm text-[var(--status-completed-fg)]">
        <CheckCircle2 className="size-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        <span>This invitation is valid.</span>
      </div>
      <p className="body-sm">
        Sign in with the provider below to claim it. We will link the new account to the invitation
        automatically.
      </p>
      {/*
        Submit to the BFF accept entry-point, not straight to NextAuth: the
        route stashes the invitation token in an httpOnly cookie before starting
        the OAuth round-trip, so the backend can bind this sign-in to the invite
        without the token ever appearing in a URL. The access/refresh tokens are
        exchanged server-side and never reach the browser.
      */}
      <form action="/api/invitations/accept" method="post" className="contents">
        <input type="hidden" name="token" value={token ?? ""} />
        <input type="hidden" name="provider" value="google" />
        <Button type="submit" className="w-full" disabled={googleOnly}>
          {label}
        </Button>
      </form>
      {googleOnly ? <p className="caption">Other providers ship with RUK-92. Use Google for now.</p> : null}
    </>
  );
}

function InvalidInvite({
  status,
  onRetry,
}: {
  status: Exclude<InviteStatus, "valid"> | "unknown_error";
  onRetry?: () => void;
}) {
  const copy: Record<typeof status, { title: string; body: string }> = {
    invalid: {
      title: "This invitation link isn't valid",
      body: "Open the original link from your email, or ask your administrator for a new invitation.",
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
  return (
    <>
      <div className="flex items-start gap-2 px-3 py-2 rounded-sm bg-[var(--destructive-bg)] border border-[var(--destructive-border)] text-sm text-[var(--destructive-fg)]">
        <AlertTriangle className="size-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        <span>{c.title}</span>
      </div>
      <p className="body-sm">{c.body}</p>
      {status === "unknown_error" && onRetry ? (
        <Button type="button" variant="outline" className="w-full" onClick={onRetry}>
          <RefreshCw className="size-3.5" aria-hidden="true" /> Try again
        </Button>
      ) : null}
    </>
  );
}
