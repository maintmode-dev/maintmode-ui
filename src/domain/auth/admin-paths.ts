/**
 * Which pages only an admin may open.
 *
 * Two prefixes since the workspace settings moved out of the header: the
 * `/admin` tabs that stayed (Users, Audit log) and `/settings/workspace`, the
 * admin half of Settings. The other half — `/settings/profile` — is every
 * user's, which is why the gate cannot simply be `/settings`.
 *
 * A prefix rather than a list of pages, like `PUBLIC_PREFIXES`: a new workspace
 * section is admin-only the moment it exists under the prefix, instead of the
 * day someone remembers to add it here. Matching is exact on the segment, so
 * `/settings/workspaces` or `/administrator` do not slip in.
 */
export const ADMIN_PREFIXES = ["/admin", "/settings/workspace"] as const;

export function isAdminPath(pathname: string): boolean {
  return ADMIN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
