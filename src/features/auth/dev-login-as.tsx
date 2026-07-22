"use client";

import { useState } from "react";
import { FlaskConical } from "lucide-react";

import { DEV_LOGIN_ROLES, type Role } from "@/domain/auth/permissions";
import { Button } from "@/shared/ui/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/shadcn/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/shadcn/select";

export interface DevLoginAsProps {
  /**
   * Server action that re-logs in through the dev-bypass provider with the
   * chosen role. Supplied by the root layout (`src/app/layout.tsx`) so this
   * browser-owned component never imports the server auth boundary. It wraps
   * NextAuth's `signIn` (CSRF attached) and redirects to `/`.
   */
  loginAsAction: (role: string) => Promise<void>;
}

/**
 * Dev-only floating "Login as {role}" toolbar. A collapsed badge in the
 * bottom-right corner expands into a role picker + button; clicking it re-logs
 * in as a fresh dev user with that role (the dev backend mints a new user per
 * login). Rendered from the root layout on every screen — only under
 * `DEV_BYPASS_ENABLED`, and dynamically imported under an inline
 * `NODE_ENV !== "production"` gate so it never reaches a production build.
 * Never wire this to real credentials.
 */
export function DevLoginAs({ loginAsAction }: DevLoginAsProps) {
  const [role, setRole] = useState<Role>(DEV_LOGIN_ROLES[0]);

  return (
    <div className="fixed bottom-4 right-4 z-[9999] print:hidden">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-dashed shadow-md bg-bg-elev-2"
            aria-label="Dev login-as toolbar"
          >
            <FlaskConical className="size-3.5" aria-hidden="true" />
            dev
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" side="top" className="w-64 space-y-2.5">
          <p className="caption text-muted">Sign in as a seeded role (re-login)</p>
          <form action={loginAsAction.bind(null, role)} className="flex gap-2">
            <Select value={role} onValueChange={(next) => setRole(next as Role)}>
              <SelectTrigger className="w-full" aria-label="Role to sign in as">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEV_LOGIN_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" variant="outline" className="shrink-0">
              Login as
            </Button>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}
