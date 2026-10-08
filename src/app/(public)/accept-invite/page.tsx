import { AcceptInvitePage } from "@/features/auth/accept-invite-page";
import { acceptInvitationWithPasswordAction } from "@/server/auth/built-in-sign-in-actions";
import { startOAuthDanceAction } from "@/server/auth/oauth-dance-actions";
import { readSessionUser } from "@/server/auth/session-token";
import { resolveAuthProviders } from "@/server/backend/auth/resolve-auth-providers";
import { signInProviders } from "@/domain/auth/sign-in-method";
import { resolveInvitationPreview } from "@/server/backend/invitations/resolve-invitation-preview";

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const sp = await searchParams;

  /**
   * Both reads happen server-side, and CONCURRENTLY.
   *
   * Server-side rather than in a client `useQuery`: it removes a client
   * round-trip and the loading skeleton, and it leaves `/accept-invite` with no
   * React Query dependency at all — a precondition for serving public routes
   * without `QueryClientProvider`.
   *
   * Concurrently because they share nothing: awaiting them in sequence made
   * this route's first byte wait for the SUM of two deadlines rather than the
   * larger of them. `Promise.all` is safe here specifically because neither
   * resolver throws — one answers `{ ok: false }`, the other
   * `{ status: "unknown_error" }` — so there is no rejection for fail-fast to
   * surface and `allSettled` would buy nothing.
   *
   * ## Why the provider read is here at all (RUK-304)
   *
   * `b74a4536` moved sign-in providers into the integration registry and its
   * migration deleted the existing rows, so a fresh deployment has none — while
   * this page used to hard-code "google". `startOAuthDanceAction` sends the
   * browser to the backend's `/start`, and the backend answers an unknown provider with a JSON error
   * rather than a redirect (deliberately: it has no trusted frontend address at
   * that point), so the invitee lands on raw backend JSON on another origin
   * with only the back button to escape.
   *
   * It is a genuinely added round-trip on a public route — the resolver is not
   * already called here the way it is on `/login` — and worth one: the
   * alternative is a button whose only outcome is that JSON. Running it
   * alongside the preview is what keeps the cost to a shared wait rather than
   * an added one.
   *
   * Every advertised provider gets a button (BUG-4): an organisation whose only
   * way in is its own `custom` OIDC provider was told "sign-in isn't set up"
   * here, because the page only ever looked for Google.
   *
   * `{ ok: false }` (transport failure) is treated as AVAILABLE rather than
   * unavailable: `signInProviders` falls back to Google, and the password form
   * is offered too. Hiding either on a failed read would strand an invitee
   * whose way in is fine. Both fail recoverably: a dance is refused before any
   * state is minted, and the password path answers `method_disabled` without
   * claiming the invitation.
   *
   * Only a RESOLVED list with no provider in it suppresses the button, which
   * is the deterministic post-migration case.
   */
  const [preview, providers] = await Promise.all([
    resolveInvitationPreview(sp.token),
    resolveAuthProviders(),
  ]);
  const offered = signInProviders(providers.ok ? providers.methods : undefined);

  /**
   * An invitation can also be accepted by SETTING A PASSWORD — the way in for
   * an organisation with no identity provider. Offered when the backend lists
   * password sign-in (the same test `/login` draws its form from), or when the
   * list could not be read: the backend then decides, and a switched-off method
   * comes back as `method_disabled` on the form rather than as a lost way in.
   */
  const passwordOffered = !providers.ok || providers.methods.some((m) => m.type === "password");

  /**
   * Accepting an invitation is now the ordinary OAuth dance with the invitation
   * riding along: the backend resolves it before creating the user and grants
   * its roles from inside the dance, so there is no accept call to make.
   *
   * Defined here rather than in the component because the component is
   * `"use client"` and may not import `src/server/**` — and because closing the
   * token over the action on the server is what stops a client supplying one of
   * its own.
   *
   * The provider id is an ARGUMENT, bound per button by the component, so it is
   * client-reachable — deliberately, and the same as `/login`'s `signInAction`.
   * A forged id can only start a dance for a provider the backend serves (it
   * checks the segment against its registry before minting anything, and
   * refuses an unknown one without spending the invitation); the token, which
   * is the thing worth protecting, stays closed over here.
   */
  async function acceptAction(providerId: string): Promise<string> {
    "use server";
    return startOAuthDanceAction(providerId, undefined, sp.token);
  }

  /**
   * Accepting with a password. The token is closed over here for the same
   * reason as above: the form sends only the password, so it cannot accept a
   * different invitation than the one this page was opened with.
   */
  async function passwordAcceptAction(password: string) {
    "use server";
    return acceptInvitationWithPasswordAction({ invitationToken: sp.token ?? "", password });
  }

  /**
   * `readSessionUser()`, NOT `readActiveSession()`. The latter refreshes and writes the
   * session cookie when the access token is near expiry, and Next permits a
   * cookie write only in a Server Action or Route Handler — in a page render it
   * throws. That failure appears only inside the rotation window: green tests,
   * intermittent production 500s. `set-password-page.tsx` documents the same
   * trap. The action does the enforcing and may use the refreshing reader; this
   * read is only to decide what to render.
   *
   * The two readers are NOT the same predicate, and the difference is
   * deliberate. `readActiveSession()` returns null once a refresh has failed;
   * `readSessionUser()` only opens the cookie and returns its user. Kept BROADER
   * here on purpose — a session whose refresh token has quietly died still
   * counts as signed in for this page — so the page never renders
   * a button the action would then refuse. Narrowing it to match the action
   * would put a live button in front of someone whose click cannot work; a
   * false "you are signed in" costs one sign-out.
   */
  const sessionUser = await readSessionUser();
  const signedInAs = sessionUser?.email ?? undefined;

  return (
    <AcceptInvitePage
      token={sp.token}
      preview={preview}
      acceptAction={acceptAction}
      signedInAs={signedInAs}
      providers={offered}
      passwordOffered={passwordOffered}
      passwordAcceptAction={passwordAcceptAction}
    />
  );
}
