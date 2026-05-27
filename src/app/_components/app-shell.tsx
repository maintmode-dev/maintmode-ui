"use client";

import type { ReactNode } from "react";

import { isAdmin } from "@/domain/auth/permissions";
import { useMeQuery } from "@/features/_shared/queries/use-me-query";

import { AppHeader } from "./app-header";

/**
 * Authenticated app shell with the global header. Sources the current user
 * from `useMeQuery()`. While the query is loading or has failed, the header
 * renders an anonymous chrome — NO admin links, NO user identity, just the
 * brand + main nav for non-admin pages.
 *
 * The middleware `/api/**` bypass means a missing session reaches this
 * component as an error from `/api/me`; the in-flight 401 redirect inside
 * `bffFetch` takes the browser to `/login` before the user sees the
 * anonymous header for more than a frame.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const meQuery = useMeQuery();
  const me = meQuery.data;
  const headerUser = me
    ? {
        email: me.email,
        display_name: me.display_name,
        is_admin: isAdmin(me.roles),
      }
    : null;
  return (
    <div className="min-h-screen flex flex-col bg-bg text-fg">
      <AppHeader user={headerUser} />
      <main className="flex-1 min-h-0">{children}</main>
    </div>
  );
}
