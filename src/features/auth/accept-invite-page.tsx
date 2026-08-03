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
   * Server action that stashes the invitation token and starts the OAuth
   * sign-in via NextAuth `signIn` (so CSRF is attached). Bound with the token
   * at the call site, mirroring the `/login` `signInAction` pattern.
   */
  acceptAction: (token: string) => Promise<void>;
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
export function AcceptInvitePage({ token, preview, acceptAction }: AcceptInvitePageProps) {
  return (
    <main className="min-h-screen grid place-items-center p-6 bg-bg">
      <div className="w-full max-w-[480px] bg-bg-elev-1 border border-border-subtle rounded-lg shadow-[var(--shadow-md)] p-8 space-y-5">
        {preview.status === "valid" ? (
          <ValidInvite
            token={token}
            suggestedProvider={asSuggestedProvider(preview.suggested_provider)}
            acceptAction={acceptAction}
          />
        ) : (
          <InvalidInvite status={preview.status} token={token} />
        )}
      </div>
    </main>
  );
}

/**
 * The server projection types `suggested_provider` as a bare string (it only
 * guarantees the field is a string, never that it is a provider we wire).
 * Narrow it here; anything unrecognized falls through to `undefined`, which
 * `ValidInvite` treats as the Google default.
 */
function asSuggestedProvider(value: string | undefined): SuggestedProvider | undefined {
  return value === "google" || value === "github" ? value : undefined;
}

function ValidInvite({
  token,
  suggestedProvider,
  acceptAction,
}: {
  token?: string;
  suggestedProvider?: SuggestedProvider;
  acceptAction: (token: string) => Promise<void>;
}) {
  // MVP wires Google only; other providers ship later. The backend currently
  // always returns null for suggested_provider, so this defaults to Google.
  const provider = suggestedProvider ?? "google";
  const label = provider === "github" ? "Continue with GitHub" : "Continue with Google";
  const googleOnly = provider !== "google";

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
        Submit to the `acceptAction` server action (not a plain POST to NextAuth):
        it stashes the invitation token in an httpOnly cookie, then starts the
        OAuth round-trip via NextAuth `signIn` so the CSRF token is attached.
        The `signIn` callback consumes the cookie and exchanges via the backend
        accept endpoint — the token never appears in a URL and backend tokens
        never reach the browser.
      */}
      <form action={acceptAction.bind(null, token ?? "")} className="w-full">
        <Button type="submit" className="w-full" disabled={googleOnly}>
          {label}
        </Button>
      </form>
      {googleOnly ? <p className="caption">Other providers are coming soon. Use Google for now.</p> : null}
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
