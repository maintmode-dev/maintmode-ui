"use server";

import { redirect } from "next/navigation";

import { signOut } from "@/server/auth/auth-config";
import { revokeBackendSession } from "@/server/auth/backend-token-exchange";
import { clearActiveSession, readActiveSession } from "@/server/auth/session-token";

/**
 * Sign-out server action. The header dropdown is a client component and can't
 * declare a `"use server"` action inline (the way `login/page.tsx` does), so it
 * lives here and is imported into the client — the standard Next.js pattern for
 * sharing a server action with client UI.
 *
 * Why an action and not the `/api/auth/logout` POST: a plain `<form>` POST
 * submitted from inside a Radix `DropdownMenuItem` is cancelled when the menu
 * closes on select, so the request never fires. A server action invoked via
 * `<form action={…}>` is dispatched by React before the menu unmounts, and
 * NextAuth attaches the CSRF token itself.
 *
 * Mirrors the `/api/auth/logout` route's work: revoke the backend refresh token
 * (best-effort — the cookie is the browser's source of truth) before clearing
 * the NextAuth jwt + active-session cookies.
 */
export async function signOutAction(): Promise<void> {
  const session = await readActiveSession();
  if (session) {
    try {
      await revokeBackendSession(session.accessToken, session.refreshToken);
    } catch {
      // Backend may already have invalidated the refresh token; clearing the
      // cookie is what matters for the browser.
    }
  }

  await signOut({ redirect: false });
  await clearActiveSession();

  redirect("/login");
}
