import { Label } from "@/shared/ui/shadcn/label";

/**
 * Labeled form field used by the resource create modal and the detail edit
 * form. Extracted so the two forms share one label style rather than each
 * redefining an identical local `Field`.
 */
export function ResourceField({
  label,
  htmlFor,
  counter,
  children,
}: {
  label: string;
  htmlFor?: string;
  /** Optional `N / max` char counter shown at the right of the label row. */
  counter?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label
          htmlFor={htmlFor}
          className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim"
        >
          {label}
        </Label>
        {counter ? <span className="font-mono tabular-nums text-[10px] text-fg-dim">{counter}</span> : null}
      </div>
      {children}
    </div>
  );
}
