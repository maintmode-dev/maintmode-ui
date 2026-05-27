import { Skeleton } from "@/shared/ui/domain/skeleton";

/**
 * Calendar loading state — solid sticky chrome (top bar / day axis / hour
 * gutter), shimmering event bars in the body grid only. Per spec: only body
 * content shimmers, chrome stays solid.
 *
 * This is a generic, layout-agnostic skeleton — the parent route is welcome
 * to wrap it in the real calendar shell. For pages that don't have a real
 * shell yet, this renders a stand-in approximation.
 */
export function CalendarLoading() {
  const days = 7;
  const hours = 8;
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="bg-bg-elev-1 border border-border-subtle rounded-md overflow-hidden"
    >
      {/* day-name header row (solid chrome) */}
      <div className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))] border-b border-border-subtle bg-bg-elev-2">
        <div />
        {Array.from({ length: days }).map((_, i) => (
          <div key={i} className="px-2 py-2 text-xs text-fg-muted border-l border-border-subtle">
            Day {i + 1}
          </div>
        ))}
      </div>
      {/* hour gutter (solid) + body cells with shimmer bars */}
      <div className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))]">
        <div className="border-r border-border-subtle bg-bg-elev-2">
          {Array.from({ length: hours }).map((_, h) => (
            <div
              key={h}
              className="h-14 px-2 text-[10px] text-fg-dim font-mono pt-1 border-b border-border-subtle"
            >
              {String(h * 3).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        {Array.from({ length: days }).map((_, d) => (
          <div key={d} className="border-l border-border-subtle relative">
            {Array.from({ length: hours }).map((_, h) => (
              <div key={h} className="h-14 border-b border-border-subtle" />
            ))}
            {/* a few event-shaped placeholder bars per column */}
            {d % 2 === 0 ? (
              <div className="absolute left-1 right-1 top-[18%] h-8">
                <Skeleton type="block" height={32} />
              </div>
            ) : null}
            {d % 3 === 0 ? (
              <div className="absolute left-1 right-1 top-[55%] h-12">
                <Skeleton type="block" height={48} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
