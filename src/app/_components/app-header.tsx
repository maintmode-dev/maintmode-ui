import "server-only";

import Link from "next/link";

import { auth, signOut } from "@/server/auth/auth-config";
import { readActiveSession } from "@/server/auth/session-token";
import { revokeBackendSession } from "@/server/auth/backend-token-exchange";
import { readMaintmodeBackendConfig } from "@/server/backend/config";
import { isAdmin } from "@/domain/auth/permissions";

async function performSignOut() {
  "use server";
  const session = await readActiveSession();
  if (session) {
    try {
      await revokeBackendSession(session.accessToken, session.refreshToken);
    } catch {
      // Backend may already have invalidated the refresh token; clearing the
      // local session cookie is what matters for the browser.
    }
  }
  await signOut({ redirectTo: "/login" });
}

export async function AppHeader() {
  const session = await auth();
  const config = safeReadConfig();
  const user = session?.user as
    | { email?: string; displayName?: string; roles?: string[] }
    | undefined;
  const mockMode = config?.enableMockData ?? false;
  const isAuthenticated = Boolean(user?.email);
  const isAdminUser = isAdmin(user?.roles);

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <Link className="brand" href="/" aria-label="Maintmode home">
          <span className="brand__mark" aria-hidden="true" />
          <span>Maintmode</span>
        </Link>
        <nav className="app-nav" aria-label="Primary">
          <Link href="/">Calendar</Link>
          {isAuthenticated ? (
            <Link href="/resources" data-testid="nav-resources">
              Resources
            </Link>
          ) : null}
          {isAdminUser ? (
            <>
              <Link href="/admin/users" data-testid="nav-admin">
                Admin
              </Link>
              <Link href="/audit" data-testid="nav-audit">
                Audit log
              </Link>
            </>
          ) : null}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          {mockMode ? (
            <span
              role="status"
              className="rounded-full border border-[var(--warning-border)] bg-[var(--warning-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--warning-fg)]"
            >
              Mock data
            </span>
          ) : null}
          {user?.email ? (
            <>
              <span className="text-[var(--muted)]" data-testid="active-user-email">
                {user.displayName || user.email}
              </span>
              <form action={performSignOut}>
                <button
                  type="submit"
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-semibold text-[var(--muted-strong)] hover:bg-[var(--surface-subtle)]"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function safeReadConfig() {
  try {
    return readMaintmodeBackendConfig();
  } catch {
    return null;
  }
}
