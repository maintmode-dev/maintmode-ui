import "server-only";

import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";

/**
 * The browser's `X-Forwarded-For`, passed through to the backend unchanged.
 *
 * Every server-side call reaches the backend from this container's address, so
 * without it the backend's per-IP sign-in limit is one bucket for all users:
 * anyone spending it locks everyone out, break-glass included. The backend
 * keys that limit on X-Forwarded-For, trusting it only when private hops wrote
 * it — the edge proxy in front of us (Caddy in both deployments, which sets the
 * header from the real peer) and the internal listener behind us.
 *
 * Verbatim, never extended: appending this server's address is the next hop's
 * job, and a value built from anything else (a body field, `X-Real-IP`) would
 * be an address the edge proxy never vouched for. Next fills the header from
 * the socket when no proxy sent one, so in a running server it is always there.
 *
 * Refresh-token binding is unaffected: the backend binds those to the
 * connecting peer, not to this header.
 */
export async function forwardedForHeader(): Promise<Record<string, string>> {
  let incoming: string | null;
  try {
    incoming = (await headers()).get("x-forwarded-for");
  } catch (error) {
    // Next signals prerender bailouts by throwing from `headers()`; those must
    // propagate. What remains is a call outside any request (no browser to
    // speak for), which sends nothing — the pre-forwarding behaviour.
    unstable_rethrow(error);
    return {};
  }
  return incoming ? { "x-forwarded-for": incoming } : {};
}
