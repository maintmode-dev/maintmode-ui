"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { isAdmin } from "@/domain/auth/permissions";
import { useMeQuery } from "@/features/_shared/queries/use-me-query";
import { cn } from "@/shared/ui/lib/cn";

/**
 * The Settings sections, in the order the side menu lists them.
 *
 * Two groups: the signed-in person's own settings, and the instance's, which
 * only an admin sees. Authentication and Integrations used to be header tabs
 * beside Calendar and Approvals; they are configuration an admin opens once in
 * a while, not a place people work, so they live here now and the header keeps
 * the everyday screens.
 *
 * Workspace paths sit under `/settings/workspace`, which is the prefix the auth
 * gate treats as admin-only (`isAdminPath`) — a new section added there is
 * gated the moment it exists.
 */
export const SETTINGS_SECTIONS = [
  { group: "Account", adminOnly: false, items: [{ href: "/settings/profile", label: "Profile" }] },
  {
    group: "Workspace",
    adminOnly: true,
    items: [
      { href: "/settings/workspace/authentication", label: "Authentication" },
      { href: "/settings/workspace/integrations", label: "Integrations" },
    ],
  },
] as const;

/**
 * Side menu + the section's page. One section per page, deliberately: each
 * answers one question ("how do people sign in", "where do notifications go")
 * instead of every setting stacked on one scroll.
 *
 * On a narrow screen the menu becomes a row above the page rather than a
 * column beside it, so the page keeps the full width.
 *
 * Roles come from the same `/me` query `AppShell` already runs (shared cache).
 * Until it answers, the Workspace group is not drawn — the same rule the
 * header follows: no admin links until the server has said so.
 */
export function SettingsFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdminUser = isAdmin(useMeQuery().data?.roles);
  const groups = SETTINGS_SECTIONS.filter((g) => !g.adminOnly || isAdminUser);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-2 px-4 pt-4 sm:px-6 md:flex-row md:gap-8 md:pt-6">
      <nav aria-label="Settings" className="shrink-0 md:w-48">
        {/* Not a heading: each section's page has its own h1, and the nav is
            already named "Settings" for assistive tech. */}
        <p className="mb-3 hidden px-2 text-sm font-semibold text-fg-strong md:block">Settings</p>
        <div className="flex gap-4 overflow-x-auto [scrollbar-width:none] md:flex-col md:gap-5">
          {groups.map((group) => (
            <div key={group.group} className="flex shrink-0 items-center gap-1 md:flex-col md:items-stretch">
              <p className="hidden px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-fg-muted md:block">
                {group.group}
              </p>
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-sm px-2 text-sm text-fg-muted transition-colors hover:bg-bg-elev-2 hover:text-fg",
                      active && "bg-bg-elev-2 text-fg-strong",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
