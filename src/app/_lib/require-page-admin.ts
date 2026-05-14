import "server-only";

import { redirect } from "next/navigation";

import { auth } from "@/server/auth/auth-config";
import { isAdmin } from "@/domain/auth/permissions";

export type PageGateResult =
  | { kind: "ok"; roles: readonly string[] }
  | { kind: "forbidden"; roles: readonly string[] };

/**
 * Page-level admin gate. Redirects unauthenticated visitors to /login; for
 * signed-in non-admins returns a forbidden marker so the page can render
 * `<ForbiddenState/>` and keep the URL stable.
 */
export async function requirePageAdmin(nextPath: string): Promise<PageGateResult> {
  const session = await auth();
  if (!session?.user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  const roles = (session.user as { roles?: string[] }).roles ?? [];
  if (!isAdmin(roles)) {
    return { kind: "forbidden", roles };
  }
  return { kind: "ok", roles };
}

export async function requirePageAuth(nextPath: string): Promise<{ roles: readonly string[] }> {
  const session = await auth();
  if (!session?.user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  const roles = (session.user as { roles?: string[] }).roles ?? [];
  return { roles };
}
