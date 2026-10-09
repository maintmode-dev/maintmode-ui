import "server-only";

import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";

/**
 * The browser's `X-Forwarded-For` and `User-Agent`, passed through to the
 * backend unchanged.
 *
 * Every server-side call reaches the backend from this container, so without
 * them the backend sees this server instead of the person: its per-IP sign-in
 * limit becomes one bucket for all users (anyone spending it locks everyone
 * out, break-glass included), and every audit row and session record names
 * this container's address and Node's own `node` User-Agent.
 *
 * The backend resolves the client from X-Forwarded-For, trusting it only when
 * private hops wrote it — the edge proxy in front of us (Caddy in both
 * deployments, which sets the header from the real peer) and the internal
 * listener behind us. The same resolved address is what it records on the
 * sign-in audit row and on the refresh-token row; no session is bound to it,
 * so a changing address never signs anyone out.
 *
 * Verbatim, never extended or synthesised: appending this server's address is
 * the next hop's job, and a value built from anything else (a body field,
 * `X-Real-IP`, a default User-Agent) would be something the browser or the
 * edge proxy never sent. A header the request did not carry is not sent at
 * all. Next fills X-Forwarded-For from the socket when no proxy sent one, so in
 * a running server that one is always there.
 */
export async function forwardedClientHeaders(): Promise<Record<string, string>> {
  let incoming: Headers;
  try {
    incoming = await headers();
  } catch (error) {
    // Next signals prerender bailouts by throwing from `headers()`; those must
    // propagate. What remains is a call outside any request (no browser to
    // speak for), which sends nothing — the pre-forwarding behaviour.
    unstable_rethrow(error);
    return {};
  }

  const forwarded: Record<string, string> = {};
  const forwardedFor = incoming.get("x-forwarded-for");
  if (forwardedFor) forwarded["x-forwarded-for"] = forwardedFor;
  const userAgent = incoming.get("user-agent");
  if (userAgent) forwarded["user-agent"] = userAgent;
  return forwarded;
}
