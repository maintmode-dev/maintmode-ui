import type { Role } from "@/domain/auth/permissions";
import { Label } from "@/shared/ui/shadcn/label";

/** Roles sorted admin-first for chip display + the checkbox list, per contract. */
export const ROLE_ORDER: Role[] = ["admin", "reviewer", "editor", "guest"];
export function sortRoles(roles: Role[]): Role[] {
  return [...roles].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
}

/** One-line role descriptions for the checkbox lists (user + invite sheets). */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Full access — manage users, roles, and every maintenance.",
  reviewer: "Approve maintenance windows and review changes.",
  editor: "Create and edit maintenance, resources, and channels.",
  guest: "Read-only access to the calendar and catalogs.",
};

/** Uppercase-label field wrapper shared by the user and invite sheets. */
export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-2xs font-semibold uppercase tracking-[0.08em] text-fg-dim">
        {label}
      </Label>
      {children}
    </div>
  );
}
