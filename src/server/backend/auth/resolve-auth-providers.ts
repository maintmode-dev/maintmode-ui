import "server-only";

import { backendRequest } from "@/server/backend/client/backend-client";
import { isKnownSignInMethodType, type SignInMethod } from "@/domain/auth/sign-in-method";

/**
 * Server-side resolution of the sign-in methods for `/login` (RUK-288).
 *
 * Called directly from the server page rather than through a BFF route: the
 * list has no browser consumer, and having the server fetch its own origin
 * would add a round-trip for nothing. See SPEC §4.0.
 *
 * **Never throws.** `/login` is a dynamic server component, so an uncaught
 * throw here is a 500 — turning a degraded auth service into a dead login page
 * for a self-hosted instance, including for the administrator who would fix it.
 * Every failure resolves to `{ ok: false }` and the page renders its
 * break-glass fallback instead (SPEC §6.1).
 *
 * The fallback is for **transport failure only** — no answer, or one that
 * cannot be parsed. A successfully parsed list is returned as it stands, even
 * when empty: once the method list becomes admin-toggleable (FU-2), treating an
 * empty list as failure would hand an administrator who deliberately disabled
 * password sign-in a synthesized form that answers 401 forever.
 */
/** See the `signal` comment in the fetch below. */
const PROVIDERS_TIMEOUT_MS = 2_000;

export type ResolvedAuthProviders = { ok: true; methods: SignInMethod[] } | { ok: false };

/** Wire envelope. Snake_case, mirrors `apiauthmodels.AuthMethodsResponse`. */
interface AuthMethodsWire {
  methods?: unknown;
}

function toMethod(raw: unknown): SignInMethod | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const { id, type, display_name: displayName } = raw as Record<string, unknown>;
  if (typeof id !== "string" || typeof type !== "string" || typeof displayName !== "string") {
    return null;
  }
  // An unrecognised `type` is preserved, not dropped: the page renders it as a
  // disabled placeholder so a newly-advertised method is visible-but-inert
  // rather than silently missing. Narrowing happens at the render site.
  return {
    id,
    type: isKnownSignInMethodType(type) ? type : ("redirect" as const),
    display_name: displayName,
  };
}

export async function resolveAuthProviders(): Promise<ResolvedAuthProviders> {
  let raw: unknown;
  try {
    raw = await backendRequest<unknown>({
      path: "/api/v1/auth/providers",
      method: "GET",
      useAuthBase: true,
      // Public endpoint: never send credentials, and never let a cached
      // response serve one instance's method list to another.
      cache: "no-store",
      // Tighter than the shared 10s default, because this call blocks the
      // cold-start route's first byte. The break-glass fallback below exists to
      // be REACHED: holding a blank tab for ten seconds before rendering it is
      // indistinguishable from a dead site, and two seconds is generous for a
      // static list read over the gateway. (This endpoint carries no
      // anti-timing floor — that applies to the OTP and password paths.)
      signal: AbortSignal.timeout(PROVIDERS_TIMEOUT_MS),
    });
  } catch (error) {
    // Deliberately swallows the status code. A 404 cannot distinguish a backend
    // predating RUK-284/287 from a misrouted gateway — `authApiBaseUrl` carries
    // the gateway's `/auth` prefix — so branching on it would strip the
    // break-glass password form on a mere config typo (SPEC §6.1).
    console.error("[auth-providers] resolve failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false };
  }

  const wire = raw as AuthMethodsWire;
  if (!Array.isArray(wire?.methods)) {
    console.error("[auth-providers] unparseable response: `methods` is not an array");
    return { ok: false };
  }

  const methods = wire.methods.map(toMethod).filter((m): m is SignInMethod => m !== null);
  return { ok: true, methods };
}
