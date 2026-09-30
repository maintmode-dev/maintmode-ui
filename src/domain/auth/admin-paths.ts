/**
 * Which pages only an admin may open: the Administration section, `/admin/*`.
 *
 * Shared by the auth gate (`src/proxy.ts`) and the header, which highlights
 * "Administration" on exactly these pages — one definition, so the item that
 * lights up and the pages that are gated cannot drift apart.
 *
 * A prefix rather than a list of pages, like `PUBLIC_PREFIXES`: a new admin page
 * is gated the moment it exists under the prefix. Matching is exact on the
 * segment, so `/administrator` does not slip in.
 */
export const ADMIN_PREFIXES = ["/admin"] as const;

export function isAdminPath(pathname: string): boolean {
  return ADMIN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
