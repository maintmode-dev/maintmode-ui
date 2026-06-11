import { Label } from "@/shared/ui/shadcn/label";

/**
 * Labeled form field used by the channel create modal and the detail edit form.
 * Mirrors `ResourceField` so the two catalogs share one label style. `help`
 * renders muted helper copy under the control; `error` (when present) replaces
 * it with a destructive message tied to the field via `aria-describedby`.
 */
export function NotifyChannelField({
  label,
  htmlFor,
  help,
  error,
  counter,
  children,
}: {
  label: string;
  htmlFor?: string;
  help?: React.ReactNode;
  error?: React.ReactNode;
  /** Optional `N / max` char counter shown at the right of the label row. */
  counter?: React.ReactNode;
  children: React.ReactNode;
}) {
  const describedById = htmlFor ? `${htmlFor}-desc` : undefined;
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
      {error ? (
        <p id={describedById} role="alert" className="text-xs text-[var(--destructive-fg)]">
          {error}
        </p>
      ) : help ? (
        <p id={describedById} className="text-xs text-fg-dim">
          {help}
        </p>
      ) : null}
    </div>
  );
}
