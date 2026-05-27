"use client";

import { LogOut, ShieldAlert } from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/ui/shadcn/button";
import { Input } from "@/shared/ui/shadcn/input";
import { Label } from "@/shared/ui/shadcn/label";
import { Textarea } from "@/shared/ui/shadcn/textarea";
import { Separator } from "@/shared/ui/shadcn/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/shadcn/alert-dialog";
import { StatusBadge } from "@/shared/ui/domain/status-badge";
import { Skeleton } from "@/shared/ui/domain/skeleton";

import { useMeQuery } from "@/features/_shared/queries/use-me-query";

export function UserSettingsPage() {
  const meQuery = useMeQuery();
  const [bio, setBio] = useState("");
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

  return (
    <div className="mx-auto max-w-[760px] p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="h1">Profile settings</h1>
        <p className="body-sm">Manage your account, sessions, and connected providers.</p>
      </header>

      <Card title="Account">
        <Field label="Email" htmlFor="s-email">
          <Input id="s-email" value={user.email} readOnly className="font-mono" />
        </Field>
        <Field label="Display name" htmlFor="s-name">
          <Input id="s-name" defaultValue={user.display_name} />
        </Field>
        <Field label="Bio" htmlFor="s-bio">
          <Textarea
            id="s-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A short line about yourself."
            rows={3}
          />
        </Field>
        <div className="flex justify-end">
          <Button size="sm">Save profile</Button>
        </div>
      </Card>

      <Card title="Roles">
        <div className="flex flex-wrap gap-2">
          {user.roles.map((r) => (
            <span
              key={r}
              className="inline-flex items-center px-2 py-1 rounded-sm bg-bg-elev-3 text-xs uppercase tracking-[0.04em] text-fg font-medium"
            >
              {r}
            </span>
          ))}
        </div>
        <p className="caption">
          Roles are assigned by administrators. Reach out to an admin if you need different access.
        </p>
      </Card>

      <Card title="Sign-in method">
        <div className="space-y-2">
          {(["google", "github", "microsoft", "okta"] as const).map((p) => {
            const connected = user.connected_providers.includes(p);
            const supportedNow = p === "google";
            return (
              <div
                key={p}
                className="flex items-center gap-3 px-3 py-2 rounded-sm bg-bg-elev-2 border border-border-subtle"
              >
                <span className="capitalize text-sm flex-1">{p}</span>
                {connected ? (
                  <StatusBadge status="completed" dot={false} />
                ) : (
                  <span className="caption">Not connected</span>
                )}
                <Button
                  size="xs"
                  variant={connected ? "outline" : "default"}
                  disabled={!supportedNow}
                  title={supportedNow ? undefined : "Coming with RUK-92"}
                >
                  {connected ? "Disconnect" : "Connect"}
                </Button>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Session">
        <p className="body-sm">Signed in via Google. Last active just now.</p>
        <div className="flex flex-wrap gap-2">
          <form action="/api/auth/logout" method="post">
            <Button type="submit" variant="outline" size="sm">
              <LogOut className="size-3.5" aria-hidden="true" /> Sign out
            </Button>
          </form>
          <Button variant="outline" size="sm" onClick={() => setSignOutAllOpen(true)}>
            Sign out everywhere
          </Button>
        </div>
      </Card>

      <Separator />

      <Card title="Danger zone" tone="danger">
        <p className="body-sm">
          Deleting your account is irreversible. All audit log entries you authored remain attributed by
          display name.
        </p>
        <div>
          <Button
            variant="outline"
            size="sm"
            className="text-[var(--destructive-fg)] border-[var(--destructive-border)] hover:bg-[var(--destructive-bg)]"
          >
            <ShieldAlert className="size-3.5" aria-hidden="true" /> Delete account
          </Button>
        </div>
      </Card>

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
            <AlertDialogAction>Sign out everywhere</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Card({
  title,
  tone = "default",
  children,
}: {
  title: string;
  tone?: "default" | "danger";
  children: React.ReactNode;
}) {
  return (
    <section
      className={
        tone === "danger"
          ? "rounded-md border border-[var(--destructive-border)] bg-[var(--destructive-bg)]/30 p-5 space-y-4"
          : "rounded-md border border-border-subtle bg-bg-elev-1 p-5 space-y-4"
      }
    >
      <h2 className="h3">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim">
        {label}
      </Label>
      {children}
    </div>
  );
}
