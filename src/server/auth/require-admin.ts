import "server-only";

import { auth } from "@/server/auth/auth-config";
import { isAdmin } from "@/domain/auth/permissions";
import { BackendRequestError, BackendUnauthorizedError } from "@/server/backend/errors/backend-request-error";

/**
 * Defense-in-depth role gate for admin/audit BFF route handlers.
 * Backend still enforces RBAC; this short-circuits requests from non-admin
 * sessions so we don't make wasted backend calls and produce a normalized
 * `FORBIDDEN` payload via `routeErrorResponse`.
 */
export async function requireAdminSession(): Promise<void> {
  const session = await auth();
  if (!session?.user) {
    throw new BackendUnauthorizedError("no active session");
  }
  const roles = (session.user as { roles?: string[] }).roles;
  if (!isAdmin(roles)) {
    throw new BackendRequestError(403, JSON.stringify({ code: "FORBIDDEN", message: "Admin role required" }));
  }
}
