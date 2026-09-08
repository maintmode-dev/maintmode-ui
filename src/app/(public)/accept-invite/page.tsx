import { AcceptInvitePage } from "@/features/auth/accept-invite-page";
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
   * RUK-292: there is no accept action any more.
   *
   * Accepting through a provider needed the provider's `id_token` — the backend's
   * accept endpoint takes one (`OAuthPayload.IDToken`) — and the backend-driven
   * dance never hands the frontend an `id_token`, only an opaque one-time code
   * redeemable for a token pair. Routing accept through the dance does not work
   * either: the dance signs in with an empty `UserCreationPolicy`, so an invited
   * user who does not exist yet is refused with `signup_disabled` before the
   * invitation is ever read.
   *
   * The preview still resolves and the invitation is NOT consumed, so the link
   * stays valid for whenever the backend gains a dance-based accept path.
   * (SPEC section 3.)
   */
  return <AcceptInvitePage token={sp.token} preview={preview} />;
}
