"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { MaintenanceEditMode } from "./maintenance-edit-mode";

/**
 * `/maintenance/new` — the new-draft form. Per the design there is no separate
 * "Create maintenance" screen: creating is the maintenance page rendered as an
 * empty draft, inside the same 60/40 shell, with a back-to-calendar top bar and
 * a conflicts panel that just notes conflicts are computed after the draft is
 * saved.
 *
 * This lives in its own module — not behind a runtime `if (creating)` inside
 * maintenance-details-page.tsx — because a runtime branch is not a bundler
 * boundary. With both views in one module Turbopack traced both branches from a
 * single entry and the two routes shipped byte-identical payloads. The split at
 * the route entry is what makes them diverge.
 *
 * `MaintenanceEditMode` is imported STATICALLY on purpose: here the form IS the
 * page, so deferring it would only put a spinner on the critical path. The
 * detail page does the opposite and loads it via `dynamic()`, because there the
 * form is behind a tab.
 *
 * Accepted duplication: the grid shell and the Conflicts aside WRAPPER (~15
 * lines) are repeated in maintenance-details-page.tsx — the wrapper only. The
 * detail page's aside renders real conflict data and is far longer; what is
 * actually shared is the shell and the heading. Factoring them into a shared shell
 * module would make that module a new joint import boundary and reintroduce
 * exactly the create/detail coupling this split removes.
 */
export function MaintenanceCreateView() {
  const router = useRouter();
  return (
    <article className="grid grid-cols-[60%_40%] min-h-[calc(100vh-56px)]">
      {/* LEFT */}
      <div className="p-8 overflow-auto space-y-6">
        <header className="space-y-3">
          <div className="flex items-center gap-3 text-xs font-mono text-fg-dim">
            <Link href="/" className="hover:text-fg flex items-center gap-1">
              <ArrowLeft className="size-3" aria-hidden="true" /> Back to calendar
            </Link>
          </div>
          <h1 className="h1">New maintenance</h1>
          <p className="text-sm text-fg-muted m-0">
            Plan a maintenance window. It’s saved as a draft you can review and submit for approval.
          </p>
        </header>

        <MaintenanceEditMode creating onClose={() => router.push("/")} />
      </div>

      {/* RIGHT */}
      <aside className="p-7 bg-bg-elev-2 border-l border-border-subtle overflow-auto space-y-4">
        <header className="flex items-baseline gap-3">
          <h2 className="h2">Conflicts</h2>
        </header>
        <p className="caption">Conflicts are checked after you save the draft.</p>
      </aside>
    </article>
  );
}
