import { Skeleton } from "@/shared/ui/domain/skeleton";

/**
 * Audit page loading state — 5-column table skeleton with 8 placeholder
 * rows. Sticky header chrome stays solid; only the body rows shimmer.
 */
export function AuditLoading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="bg-bg-elev-1 border border-border-subtle rounded-md overflow-hidden"
    >
      <table className="w-full text-left text-sm">
        <thead className="bg-bg-elev-2 border-b border-border-subtle">
          <tr>
            {["Timestamp", "Actor", "Event", "Target", "Detail"].map((h) => (
              <th
                key={h}
                className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 8 }).map((_, i) => (
            <tr key={i} className="border-b border-border-subtle last:border-b-0">
              <td className="px-3 py-3">
                <Skeleton type="bar" width={130} />
              </td>
              <td className="px-3 py-3">
                <Skeleton type="bar" width={80} />
              </td>
              <td className="px-3 py-3">
                <Skeleton type="chip" width={90} />
              </td>
              <td className="px-3 py-3">
                <Skeleton type="bar" width={150} />
              </td>
              <td className="px-3 py-3">
                <Skeleton type="bar" width={200} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
