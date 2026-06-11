import { AcceptInvitePage } from "@/features/auth/accept-invite-page";
import { signIn } from "@/server/auth/auth-config";
import { setInvitationToken } from "@/server/auth/invitation-cookie";

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const sp = await searchParams;

  /**
   * Start the invitation-accept sign-in via the NextAuth v5 `signIn` server
   * action — the same path `/login` uses, so NextAuth attaches the CSRF token
   * itself. (A plain form POST / redirect to `/api/auth/signin/<id>` omits CSRF
   * and fails with `Configuration`.) Before handing off, stash the raw
   * invitation token in a short-lived httpOnly cookie so the `signIn` callback
   * can bind this OAuth round-trip to the invite and exchange it via the backend
   * accept endpoint — the token never appears in a URL and backend tokens never
   * reach the browser.
   */
  async function acceptInviteAction(token: string) {
    "use server";
    if (token) await setInvitationToken(token);
    await signIn("google", { redirectTo: "/" });
  }

  return <AcceptInvitePage token={sp.token} acceptAction={acceptInviteAction} />;
}
