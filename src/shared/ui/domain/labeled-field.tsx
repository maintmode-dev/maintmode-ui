import { Label } from "@/shared/ui/shadcn/label";

/**
 * Labeled form field shared by the notify-channels, resources and messenger-tag
 * fields, so those catalogs all render one label style. `help` renders muted
 * helper copy under the control; `error` (when present) replaces it with a
 * destructive message.
 *
 * Note: the message `<p>` gets `id={htmlFor}-desc`, but this component does NOT
 * set `aria-describedby` on the control — the control lives in `children`, so
 * the caller is responsible for wiring `aria-describedby` to that id.
 */
export function LabeledField({
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
