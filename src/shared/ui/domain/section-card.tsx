/**
 * Bordered semantic card grouping a set of fields under an uppercase label.
 * `--bg-elev-2` + `--border` + `--radius-lg`, per the maintenance regroup
 * contract. Shared by the read-only detail page and the create/edit form so
 * both screens group their fields into the same Overview / Impact & Targets /
 * Plan cards.
 */
export function SectionCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elev-2 p-5 space-y-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim">{label}</div>
      {children}
    </div>
  );
}
