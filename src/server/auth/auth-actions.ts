"use server";

import { redirect } from "next/navigation";

import { DEV_BYPASS_ENABLED, signIn, signOut } from "@/server/auth/auth-config";
import { revokeBackendSession } from "@/server/auth/backend-token-exchange";
import { clearActiveSession, readActiveSession } from "@/server/auth/session-token";
import { isRole } from "@/domain/auth/permissions";

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

/**
 * Dev-only "Login as {role}" server action, shared with the floating dev
 * toolbar (a client component) the same way `signOutAction` is shared with the
 * header — a client component can't declare a `"use server"` action inline.
 *
 * Signs in through the dev-bypass Credentials provider, which seeds the backend
 * `X-Test-Roles` header so the stub OAuth mints a fresh user with `role`. The
 * dev backend creates a new user per login, so this is a genuine re-login as a
 * different role rather than an in-place role change (the backend never changes
 * an existing user's roles).
 *
 * Defense in depth: even though the toolbar is only rendered under
 * `DEV_BYPASS_ENABLED`, this action is independently gated — a server action is
 * a public POST endpoint, so it must not trust that its only caller is the
 * hidden UI. When the bypass is off (every production build), it is a no-op.
 * `signIn` redirects to `/` on success (throws NEXT_REDIRECT), matching the
 * post-login destination used elsewhere (see accept-invite).
 */
export async function devLoginAsAction(role: string): Promise<void> {
  if (!DEV_BYPASS_ENABLED || !isRole(role)) {
    return;
  }
  await signIn("dev-bypass", { role, redirectTo: "/" });
}
