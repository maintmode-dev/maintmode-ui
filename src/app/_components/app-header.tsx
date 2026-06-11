"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, Settings as SettingsIcon, Sun, Moon } from "lucide-react";
import { useTheme } from "@/app/theme-provider";
import { useSyncExternalStore } from "react";

import { signOutAction } from "@/server/auth/auth-actions";
import { cn } from "@/shared/ui/lib/cn";
import { Button } from "@/shared/ui/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/shadcn/dropdown-menu";

const NAV = [
  { href: "/", label: "Calendar" },
  { href: "/resources", label: "Resources" },
  { href: "/channels", label: "Channels" },
  { href: "/admin/users", label: "Users", adminOnly: true },
  { href: "/admin/audit-log", label: "Audit log", adminOnly: true },
];

export interface AppHeaderUser {
  email: string;
  display_name: string;
  is_admin: boolean;
}

export function AppHeader({ user }: { user: AppHeaderUser | null }) {
  const pathname = usePathname();
  const isAdminUser = user?.is_admin ?? false;
  return (
    <header className="sticky top-0 z-30 h-14 border-b border-border-subtle bg-bg-elev-1/95 backdrop-blur">
      <div className="mx-auto max-w-[1400px] h-full px-6 flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2 text-fg-strong font-semibold">
          <span
            className="size-6 rounded-sm bg-accent-soft border border-[var(--accent)]/40"
            aria-hidden="true"
          />
          <span>MaintMode</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {NAV.filter((n) => !n.adminOnly || isAdminUser).map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-3 h-9 inline-flex items-center rounded-sm text-fg-muted hover:text-fg hover:bg-bg-elev-2 transition-colors",
                  active && "text-fg-strong bg-bg-elev-2",
                )}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <span className="size-6 grid place-items-center rounded-sm bg-bg-elev-3 text-fg text-xs">
                    {user.display_name.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-sm">{user.display_name}</span>
                  <ChevronDown className="size-3 opacity-60" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs text-fg-muted font-normal">
                  {user.email}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings/profile">
                    <SettingsIcon className="size-3.5" aria-hidden="true" /> Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {/* Don't let Radix close the menu on select — that unmounts the
                    form before the submit dispatches and the sign-out never
                    fires. preventDefault keeps the item mounted; the server
                    action runs and redirects to /login. */}
                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="p-0">
                  <form action={signOutAction} className="w-full">
                    <button type="submit" className="flex w-full items-center gap-2 px-2 py-1.5 text-left">
                      <LogOut className="size-3.5" aria-hidden="true" /> Sign out
                    </button>
                  </form>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            // Anonymous skeleton — keeps header height stable while /api/me
            // is in flight. If /api/me fails, bffFetch redirects to /login
            // anyway, so this state is transient on every page load.
            <div aria-hidden="true" className="h-8 w-32 rounded-sm bg-bg-elev-2 animate-pulse" />
          )}
        </div>
      </div>
    </header>
  );
}

/** True only on the client — avoids hydration-mismatch when reading theme. */
function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  if (!mounted) return null;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle theme"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
    >
      {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </Button>
  );
}
