import "server-only";

import type { LinkOutcome } from "@/domain/auth/link-outcome";
import { authenticatedBackendRequest } from "@/server/backend/client/authenticated-backend-request";
import { BackendRequestError } from "@/server/backend/errors/backend-request-error";

const COMPLETE_LINK_PATH = "/api/v1/me/providers/link/complete";

/**
 * Completes a provider LINK from the signed-in owner's session (security review
 * M1, backend `fix/oauth-browser-binding`).
 *
 * The backend's link-mode callback no longer attaches the identity itself: it
 * returns the browser to the receiver with a one-time `link_code`, and this call
 * spends it with the caller's access token and the binding nonce. The backend
 * attaches the identity only if the code was minted for THIS account and the
 * nonce matches — so a link URL handed to a colleague attaches nothing to the
 * sender's account.
 *
 * Answers, as agreed with the backend:
 *  - 204 — linked;
 *  - 409 `conflict` — the provider account is linked here already, or to someone
 *    else; shown with the advice `link_conflict` already carries;
 *  - 400 `link_invalid` — one uniform answer for an unknown, expired or spent
 *    code, a wrong proof, a code minted for another account. Deliberately not a
 *    401: a 401 here means only that the access token is bad, and the wrapper
 *    refreshes on that — which is safe, since the backend refuses a bad token
 *    before it spends the code.
 *
 * Every other failure is "did not complete, try again". Never throws: the caller
 * is a server action that redirects on the outcome.
 */
export async function completeProviderLink(linkCode: string, bindingProof: string): Promise<LinkOutcome> {
  try {
    await authenticatedBackendRequest<void>({
      path: COMPLETE_LINK_PATH,
      method: "POST",
      useAuthBase: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ link_code: linkCode, binding_proof: bindingProof }),
    });
    return "linked";
  } catch (error) {
    if (error instanceof BackendRequestError && error.status === 409) {
      return "link_conflict";
    }
    return "failed";
  }
}
