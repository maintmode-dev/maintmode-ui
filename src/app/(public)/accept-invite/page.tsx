import { AcceptInvitePage } from "@/features/auth/accept-invite-page";
import { auth } from "@/server/auth/auth-config";
import { startOAuthDanceAction } from "@/server/auth/oauth-dance-actions";
import { resolveAuthProviders } from "@/server/backend/auth/resolve-auth-providers";
import { resolveInvitationPreview } from "@/server/backend/invitations/resolve-invitation-preview";

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const sp = await searchParams;

  /**
   * Resolve the preview here rather than in a client `useQuery`. Two reasons:
   * it removes a client round-trip and the loading skeleton, and it leaves
   * `/accept-invite` with no React Query dependency at all — a precondition for
   * serving public routes without `QueryClientProvider`.
   */
  const preview = await resolveInvitationPreview(sp.token);

  /**
   * Is there a provider to dance with? (RUK-304)
   *
   * `b74a4536` moved sign-in providers into the integration registry and its
   * migration deleted the existing rows, so a fresh deployment has none — while
   * this page hard-codes "google" below. `startOAuthDanceAction` issues a
   * `redirect()`, and the backend answers an unknown provider with a JSON error
   * rather than a redirect (deliberately: it has no trusted frontend address at
   * that point), so the invitee lands on raw backend JSON on another origin
   * with only the back button to escape.
   *
   * This is a real added round-trip on a public route, not a free check — the
   * resolver is not already called here the way it is on `/login`. It is worth
   * one: the alternative is a button whose only outcome is that JSON.
   *
   * `{ ok: false }` (transport failure) is treated as AVAILABLE rather than
   * unavailable. Unlike `/login` there is no break-glass path — an invitation
   * can only be accepted through the dance — so hiding the button on a failed
   * read would strand an invitee whose provider is fine. A dance that then
   * fails is recoverable: the backend refuses before minting state, so the
   * invitation is not spent.
   *
   * Only a RESOLVED list that lacks the provider suppresses the button, which
   * is the deterministic post-migration case.
   */
  const providers = await resolveAuthProviders();
  const signInAvailable = !providers.ok || providers.methods.some((m) => m.id === "google");

  /**
   * Accepting an invitation is now the ordinary OAuth dance with the invitation
   * riding along: the backend resolves it before creating the user and grants
   * its roles from inside the dance, so there is no accept call to make.
   *
   * Defined here rather than in the component because the component is
   * `"use client"` and may not import `src/server/**` — and because closing the
   * token over the action on the server is what stops a client supplying one of
   * its own.
   */
  async function acceptAction() {
    "use server";
    await startOAuthDanceAction("google", undefined, sp.token);
  }

  /**
   * `auth()`, NOT `readActiveSession()`. The latter refreshes and writes the
   * session cookie when the access token is near expiry, and Next permits a
   * cookie write only in a Server Action or Route Handler — in a page render it
   * throws. That failure appears only inside the rotation window: green tests,
   * intermittent production 500s. `set-password-page.tsx` documents the same
   * trap. The action does the enforcing and may use the refreshing reader; this
   * read is only to decide what to render.
   *
   * The two readers are NOT the same predicate, and the difference is
   * deliberate. `readActiveSession()` returns null for a session whose refresh
   * token is dead; `auth()` still returns the user and merely annotates
   * `session.error`. Kept BROADER here on purpose — a `RefreshAccessTokenError`
   * session still counts as signed in for this page — so the page never renders
   * a button the action would then refuse. Narrowing it to match the action
   * would put a live button in front of someone whose click cannot work; a
   * false "you are signed in" costs one sign-out.
   */
  const session = await auth();
  const signedInAs = session?.user?.email ?? undefined;

  return (
    <AcceptInvitePage
      token={sp.token}
      preview={preview}
      acceptAction={acceptAction}
      signedInAs={signedInAs}
      signInAvailable={signInAvailable}
    />
  );
}
