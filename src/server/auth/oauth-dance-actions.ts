"use server";

import { redirect } from "next/navigation";

import { parseMaintmodeAuthConfig } from "@/shared/config/auth-config";
import { clearOAuthNext, setOAuthNext } from "@/server/auth/oauth-next-cookie";
import { safeNext } from "@/server/auth/safe-next";

/**
 * Server actions for the backend-driven OAuth dance (RUK-292).
 *
 * Actions rather than route handlers for the reason the built-in sign-in states:
 * no route in this app writes a cookie, and Next.js refuses `cookies().set()`
 * during a page render — so the destination cookie and the sign-in call both
 * have to live here.
 */

/**
 * Sends the browser to the backend to begin the dance.
 *
 * Everything OAuth now happens on the backend: it mints the state and the PKCE
 * verifier, holds the client secret, and talks to the provider. This app's whole
 * part is one redirect.
 *
 * The destination is stashed first, because it cannot survive the round trip any
 * other way (see `oauth-next-cookie.ts`). It is sanitized here as well as inside
 * the cookie module: this is an exported server action, so it is invocable by
 * action id with an attacker-chosen argument, and defense on an auth boundary
 * must not depend on every caller having sanitized first.
 *
 * No branch on `providerId`. The login page renders a submitting form only for
 * providers it has enabled, and the backend checks the segment against its own
 * registry before minting anything, so a second gate here would be a third
 * opinion about the same question.
 */
export async function startOAuthDanceAction(providerId: string, next?: string): Promise<void> {
  await setOAuthNext(next ? safeNext(next) : "/");

  const { authPublicBaseUrl } = parseMaintmodeAuthConfig(process.env);

  // `authPublicBaseUrl`, never `authApiBaseUrl`: this is a BROWSER navigation.
  // The API base is server-to-server and resolves to a container name in two of
  // the three shipped deployments, where it would produce a dead button.
  redirect(`${authPublicBaseUrl}/api/v1/login/oauth/${encodeURIComponent(providerId)}/start`);
}

/** Clears the dance's destination cookie. Exported for the receiver's own use. */
export async function abandonOAuthDanceAction(): Promise<void> {
  await clearOAuthNext();
}
