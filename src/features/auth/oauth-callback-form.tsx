"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/shared/ui/shadcn/button";

/**
 * Submits the receiver's form as soon as it mounts (RUK-292).
 *
 * Why it auto-submits: the one-time code the form carries is redeemable for 60
 * seconds. Waiting on a human to click spends that budget on reading time, a
 * backgrounded tab or a slow paint, and a code that expires mid-read fails with
 * a message that cannot explain itself.
 *
 * Why the button is real and visible anyway: auto-submission needs JavaScript,
 * and a browser without it would otherwise sit on "Signing you in…" forever
 * while the code quietly expired. The button is the actual submission path; this
 * component only presses it. Every other sign-in path in this app degrades to a
 * form a person can submit, and this one does too.
 *
 * Disabled once submitted so a second press cannot redeem a spent code and
 * bounce a just-signed-in user to the error page.
 */
export function OAuthCallbackForm({ label }: { label: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  // A ref, not state: the guard exists to stop a SECOND submission, and setting
  // state inside the effect that submits would schedule a cascading render for
  // a value the render output does not depend on. `disabled` is set on the DOM
  // node directly for the same reason — by the time it matters the form is
  // already navigating away.
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current) {
      return;
    }
    submitted.current = true;
    const button = ref.current;
    if (!button) {
      return;
    }
    button.disabled = true;
    // Announced, not just visually disabled: a screen reader user who lands
    // here otherwise hears a "Continue" button and no reason it stopped
    // responding.
    button.setAttribute("aria-disabled", "true");
    // `requestSubmit`, not `form.submit()`: the latter bypasses React's submit
    // handling, which is what dispatches the server action.
    button.form?.requestSubmit();
  }, []);

  return (
    <Button ref={ref} type="submit" className="w-full">
      {label}
    </Button>
  );
}
