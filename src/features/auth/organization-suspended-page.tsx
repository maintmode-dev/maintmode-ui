"use client";

import { Ban } from "lucide-react";

import { Stack } from "@/shared/ui/domain/stack";
import { Button } from "@/shared/ui/shadcn/button";

/**
 * Full-screen route body shown when the BFF fetcher intercepts a
 * `403 organization_suspended` (backend: license_suspend.go) and redirects
 * here. Chrome-less: its own centered `<main>` + a single `Stack` (no
 * AppShell, no login card). The org stays readable — only writes are gated —
 * so "Try again" re-enters the app at `/` read-only via `assign("/")`; once
 * the backend lifts the suspend, the next write just succeeds.
 */
export function OrganizationSuspendedPage() {
  return (
    <main className="min-h-screen grid place-items-center p-6 bg-bg">
      <Stack
        icon={<Ban aria-hidden="true" />}
        title="Organization suspended"
        caption="Your organization's access is paused. Contact your provider or administrator to restore it."
        cta={
          <Button type="button" onClick={() => window.location.assign("/")}>
            Try again
          </Button>
        }
      />
    </main>
  );
}
