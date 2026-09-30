"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/shared/ui/lib/cn";

/**
 * The Administration section's pages, in tab order. The first is where the
 * header's "Administration" item lands.
 *
 * Tabs under the header rather than a side menu: two of these pages are wide
 * tables (Users, Audit log), and a side column would take ~230px from them on
 * every screen. The header already carries the app's navigation, so a second
 * column would be navigation the table pays for.
 */
export const ADMIN_TABS = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/authentication", label: "Authentication" },
  { href: "/admin/integrations", label: "Integrations" },
  { href: "/admin/audit-log", label: "Audit log" },
] as const;

export const ADMIN_HOME = ADMIN_TABS[0].href;

/**
 * The tab row. Aligned with the header's content box so the tabs sit under the
 * app's own navigation; scrolls sideways on a narrow screen, like the header.
 * No admin check here: every page it appears on is behind the admin gate.
 */
export function AdminTabs() {
  const pathname = usePathname();

  return (
    <div className="border-b border-border-subtle bg-bg-elev-1">
      <nav
        aria-label="Administration"
        className="mx-auto flex h-11 max-w-[1400px] items-center gap-1 overflow-x-auto px-4 text-sm [scrollbar-width:none] sm:px-6"
      >
        {ADMIN_TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-sm px-3 text-fg-muted transition-colors hover:bg-bg-elev-2 hover:text-fg",
                active && "bg-bg-elev-2 text-fg-strong",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
