import { Skeleton } from "@/shared/ui/domain/skeleton";

/**
 * MaintenanceDetailsPage loading state. Preserves the 60/40 main split
 * (maintenance card on the left, conflicts pane on the right) so the user's
 * eye lands in the same place once data arrives. Section order matches the
 * real page: TIME → SCOPE → IMPACT → RESOURCES → DESCRIPTION → STEPS, with
 * a CONFLICTS side panel.
 *
 * Sticky chrome (top bar, footer) is intentionally solid — only body content
 * shimmers (frozen decision).
 */
export function DetailsLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="grid grid-cols-[60%_40%] min-h-[640px]">
      {/* LEFT: maintenance card */}
      <div className="p-8 space-y-5 overflow-auto">
        <div className="bg-bg-elev-2 border border-border-subtle rounded-md p-5 space-y-3">
          <Skeleton type="row" width={220} />
          <Skeleton type="bar" width={120} />
        </div>

        {(["TIME", "SCOPE", "IMPACT", "RESOURCES", "DESCRIPTION"] as const).map((label) => (
          <section key={label} className="space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim">{label}</div>
            <div className="space-y-2">
              <Skeleton type="row" width="60%" />
              <Skeleton type="row" width="40%" />
            </div>
          </section>
        ))}

        <section className="space-y-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim">STEPS</div>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 py-1.5">
              <span className="size-[22px] rounded-full bg-bg-elev-2 border border-border" />
              <Skeleton type="row" width="55%" />
            </div>
          ))}
        </section>
      </div>

      {/* RIGHT: conflicts pane */}
      <aside className="p-7 bg-bg-elev-2 border-l border-border-subtle space-y-3">
        <div className="flex items-baseline gap-3">
          <h2 className="h2">Conflicts</h2>
        </div>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-bg-elev-1 border border-border-subtle border-l-[3px] border-l-[var(--border)] rounded-md p-3.5 space-y-2"
          >
            <Skeleton type="row" width="70%" />
            <Skeleton type="bar" width="40%" />
          </div>
        ))}
      </aside>
    </div>
  );
}
