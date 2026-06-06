import { Label } from "@/shared/ui/shadcn/label";

/**
 * Labeled form field used by the resource create modal and the detail edit
 * form. Extracted so the two forms share one label style rather than each
 * redefining an identical local `Field`.
 */
export function ResourceField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-dim">
        {label}
      </Label>
      {children}
    </div>
  );
}
