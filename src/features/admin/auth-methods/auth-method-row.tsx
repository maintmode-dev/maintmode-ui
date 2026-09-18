"use client";

import type { AuthMethod } from "@/domain/auth/auth-method-settings";
import { authMethodLabel, authMethodNote, isKnownAuthMethod } from "@/domain/auth/auth-method-settings";
import { Switch } from "@/shared/ui/shadcn/switch";
import { Alert, AlertDescription } from "@/shared/ui/shadcn/alert";

/**
 * One built-in sign-in method.
 *
 * ## The note is inline and always visible
 *
 * `email_otp` carries a caveat the backend's security audit asked for: turning
 * it off closes email codes as a way to SIGN IN, but password reset keeps
 * sending codes to the same mailbox. It is rendered as standing helper text
 * rather than a tooltip or a line inside the confirmation dialog, because the
 * admin has to read it BEFORE deciding — and a toggle can be flipped without
 * the dialog ever appearing.
 *
 * ## A method this build does not know still gets a working switch
 *
 * It renders with its raw name and no caveat. It is a sign-in path already in
 * force; hiding it would hide it from the one person who can close it, and
 * disabling its switch would show a control that refuses the very row it was
 * drawn for.
 */
export function AuthMethodRow({
  method,
  busy,
  refusal,
  onToggle,
  onDismissRefusal,
}: {
  method: AuthMethod;
  busy: boolean;
  /** The backend's explanation for a refused change, kept until dismissed. */
  refusal?: string;
  onToggle: (enabled: boolean) => void;
  onDismissRefusal: () => void;
}) {
  const label = authMethodLabel(method.method);
  const note = authMethodNote(method.method);
  const unknown = !isKnownAuthMethod(method.method);

  return (
    <li className="border-b border-border-subtle last:border-b-0">
      <div className="flex items-start justify-between gap-4 px-4 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-fg-strong font-medium">{label}</span>
            {unknown ? (
              <span className="rounded border border-border-strong px-1.5 py-0.5 text-xs text-fg-muted">
                Not recognised by this version
              </span>
            ) : null}
          </div>
          {note ? <p className="mt-1 text-sm text-fg-muted">{note}</p> : null}
        </div>
        <Switch
          checked={method.enabled}
          disabled={busy}
          onCheckedChange={onToggle}
          aria-label={`${label} sign-in`}
        />
      </div>
      {refusal ? (
        <div className="px-4 pb-4">
          {/*
            Persistent, not a toast. This text names the constraint and says
            whether a break-glass credential exists — the single sentence that
            tells an admin whether closing the last way in is recoverable — and
            `sonner` would take it away on a timer.
          */}
          <Alert variant="destructive">
            <AlertDescription className="flex items-start justify-between gap-3">
              <span>{refusal}</span>
              <button
                type="button"
                onClick={onDismissRefusal}
                className="shrink-0 underline underline-offset-2"
              >
                Dismiss
              </button>
            </AlertDescription>
          </Alert>
        </div>
      ) : null}
    </li>
  );
}
