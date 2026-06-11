"use client";

import { LogOut, Plug } from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/ui/shadcn/button";
import { Separator } from "@/shared/ui/shadcn/separator";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/shadcn/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/ui/shadcn/tooltip";
import { SemanticPill } from "@/shared/ui/domain/semantic-pill";
import { Skeleton } from "@/shared/ui/domain/skeleton";
import { BrandIcon, type BrandProvider } from "@/shared/ui/icons/brand-icons";

import { useMeQuery } from "@/features/_shared/queries/use-me-query";
import type { Role } from "@/domain/auth/permissions";

/** Role chips render admin-first, consistent with users-management. */
const ROLE_ORDER: Role[] = ["admin", "reviewer", "editor", "guest"];

/** Provider rows, in the contract's order, with their display label. */
const PROVIDERS: { id: BrandProvider; label: string }[] = [
  { id: "google", label: "Google" },
  { id: "github", label: "GitHub" },
];

/** First letters of the display name for the header avatar. */
function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function UserSettingsPage() {
  const meQuery = useMeQuery();
  const [signOutAllOpen, setSignOutAllOpen] = useState(false);

  if (meQuery.isPending || !meQuery.data) {
    return (
      <div className="mx-auto max-w-[760px] p-6 space-y-3">
        <Skeleton type="row" width="30%" />
        <Skeleton type="block" />
      </div>
    );
  }
  const user = meQuery.data;
  // Lockout guard: disconnecting your only sign-in method would lock you out,
  // so the action is disabled when a single provider is connected (the backend
  // also rejects it with 400 — this is the proactive half).
  const onlyProvider = user.connected_providers.length === 1;

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-[760px] p-6 space-y-6">
        <header className="flex items-center gap-4">
          <span
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-bg-elev-3 text-sm font-semibold text-fg"
            aria-hidden="true"
          >
            {initials(user.display_name)}
          </span>
          <div className="min-w-0">
            <h1 className="h1 truncate">{user.display_name}</h1>
            <p className="body-sm font-mono text-fg-dim truncate">{user.email}</p>
          </div>
        </header>

        <Card title="Bio">
          {/* Read-only identity (frozen decision: MVP profile is identity from
              GET /me, no editable fields). */}
          <ReadOnlyField label="Display name" value={user.display_name} />
          <ReadOnlyField label="Email" value={user.email} mono />
        </Card>

        <Card title="Roles">
          <div className="flex flex-wrap gap-2">
            {[...user.roles]
              .sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b))
              .map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center px-2 py-1 rounded-sm bg-bg-elev-3 text-xs uppercase tracking-[0.04em] text-fg font-medium"
                >
                  {r}
                </span>
              ))}
          </div>
          <p className="caption">
            What you&apos;re allowed to do in MaintMode. Granted by an admin — contact one to request a
            change.
          </p>
        </Card>

        <Card title="Sign-in method">
          <p className="caption">
            Connect another provider so you can sign in with whichever one is handy. The one marked Connected
            is what you used this session.
          </p>
          <div className="space-y-2">
            {PROVIDERS.map((p) => {
              const connected = user.connected_providers.includes(p.id);
              const supportedNow = p.id === "google";
              const disconnectGuarded = connected && onlyProvider;
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-sm bg-bg-elev-2 border border-border-subtle"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-white">
                    <BrandIcon name={p.id} size={18} />
                  </span>
                  <span className={connected ? "text-sm flex-1" : "text-sm flex-1 text-fg-muted"}>
                    {p.label}
                  </span>
                  {connected ? (
                    // The session-authenticating provider is tagged "current
                    // session" (frozen decision), not a maintenance status word.
                    supportedNow ? (
                      <SemanticPill tone="positive">Current session</SemanticPill>
                    ) : (
                      <SemanticPill tone="neutral">Connected</SemanticPill>
                    )
                  ) : (
                    <span className="caption">Not connected</span>
                  )}
                  {connected ? (
                    disconnectGuarded ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-block" tabIndex={0}>
                            <Button size="xs" variant="outline" disabled className="pointer-events-none">
                              Disconnect
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          Connect another method first so you don&apos;t lock yourself out.
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Button size="xs" variant="outline">
                        Disconnect
                      </Button>
                    )
                  ) : (
                    <Button
                      size="xs"
                      variant="default"
                      disabled={!supportedNow}
                      title={supportedNow ? undefined : "Coming with RUK-92"}
                    >
                      <Plug className="size-3.5" aria-hidden="true" /> Connect
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="Session">
          <p className="caption">
            This signs you out on this device only. Use the option below to sign out from all devices.
          </p>
          <div className="flex flex-wrap gap-2">
            <form action="/api/auth/logout" method="post">
              <Button type="submit" variant="outline" size="sm">
                <LogOut className="size-3.5" aria-hidden="true" /> Sign out
              </Button>
            </form>
          </div>
        </Card>

        <Separator />

        {/* Danger zone is "Sign out from all devices" (frozen decision) — the
            design system is soft-archive only; there is no account-deletion. */}
        <DangerCard title="Sign out from all devices">
          <p className="body-sm">
            Ends every active session across all browsers and devices. You&apos;ll need to sign in again
            everywhere.
          </p>
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSignOutAllOpen(true)}
              className="text-[var(--destructive-fg)] border-[var(--destructive-border)] hover:bg-[var(--destructive-bg)]"
            >
              <LogOut className="size-3.5" aria-hidden="true" /> Sign out everywhere
            </Button>
          </div>
        </DangerCard>

        <AlertDialog open={signOutAllOpen} onOpenChange={setSignOutAllOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sign out from all devices?</AlertDialogTitle>
              <AlertDialogDescription>
                Active sessions on every browser will be terminated. You will need to sign in again on each
                device.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              {/* Plain form POST to the BFF route that revokes every session.
                  NOT AlertDialogAction — that closes the dialog on click, which
                  races (and cancels) the native form submit, so the request
                  never fires. A bare submit button lets the browser navigate to
                  the route, which 302-redirects to /login. */}
              <form action="/api/auth/logout/all" method="post">
                <Button
                  type="submit"
                  className="bg-[var(--destructive-solid)] text-white hover:bg-[var(--destructive-solid-hover)]"
                >
                  Sign out everywhere
                </Button>
              </form>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border-subtle bg-bg-elev-1 p-5 space-y-4">
      <h2 className="h3">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Danger card — `--bg-elev-2` surface with a 3px `--destructive-solid` left
 * accent-bar and an uppercase `DANGER ZONE` label, per the frozen contract
 * (reuses the destructive accent-bar from `maintenance-quick-sheet` conflicts).
 */
function DangerCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border-subtle border-l-[3px] border-l-[var(--destructive-solid)] bg-bg-elev-2 p-5 space-y-4">
      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--destructive-fg)]">
          Danger zone
        </p>
        <h2 className="h3">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ReadOnlyField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim">{label}</p>
      <p className={mono ? "text-sm font-mono text-fg" : "text-sm text-fg"}>{value}</p>
    </div>
  );
}
