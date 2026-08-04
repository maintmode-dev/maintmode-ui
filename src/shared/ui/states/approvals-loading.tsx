import { Skeleton } from "@/shared/ui/domain/skeleton";

// Kept in sync by hand with the real table's COLUMNS in `approvals-page`; the
// two files must not drift or the skeleton stops matching what it stands in for.
const COLUMNS = ["Maintenance", "Window", "Impact", "Scope", "Requested by", "Requested"];

/**
 * Approvals queue loading state — mirrors the real table's chrome so the swap
 * to data shifts nothing, and rows are `h-14` to match.
 *
 * `aria-busy` + `aria-live` are the point, not decoration: `Skeleton` is
 * `aria-hidden`, so without them a screen reader gets silence while the queue
 * loads. Same contract the other loading states hold, and the states suite
 * asserts it.
 */
export function ApprovalsLoading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading approvals"
      className="bg-bg-elev-1 border border-border-subtle rounded-md overflow-hidden"
    >
      <table className="w-full text-left text-sm table-fixed">
        <colgroup>
          <col />
          <col className="w-[22%]" />
          <col className="w-32" />
          <col className="w-24" />
          <col className="w-[18%]" />
          <col className="w-28" />
        </colgroup>
        <thead className="bg-bg-elev-2 border-b border-border-subtle">
          <tr>
            {COLUMNS.map((h) => (
              <th
                key={h}
                className="px-3 py-2 text-2xs font-semibold uppercase tracking-[0.08em] text-fg-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="border-b border-border-subtle last:border-b-0 h-14">
              <td className="px-3 py-2.5">
                <Skeleton type="bar" width={220} />
              </td>
              <td className="px-3 py-2.5">
                <Skeleton type="bar" width={130} />
              </td>
              <td className="px-3 py-2.5">
                <Skeleton type="chip" width={90} />
              </td>
              <td className="px-3 py-2.5">
                <Skeleton type="bar" width={60} />
              </td>
              <td className="px-3 py-2.5">
                <Skeleton type="bar" width={110} />
              </td>
              <td className="px-3 py-2.5">
                <Skeleton type="bar" width={70} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
