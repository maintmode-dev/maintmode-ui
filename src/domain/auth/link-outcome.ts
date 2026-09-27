/**
 * The outcome of a provider LINK that returned through the OAuth receiver
 * (GAP-2, v0.2.0-rc), as the profile page is told it: `?linked=1` or
 * `?link_error=<one of these>`.
 *
 * A closed set, never a raw backend value — the parameter sits in the address
 * bar and is rendered on the page. The receiver maps to it
 * (`oauth-dance-actions.ts`), the profile page validates against it, and the
 * card words it.
 *
 * In `domain/` rather than beside the card because both a server page and a
 * `"use client"` component call `isLinkOutcome`, and a function exported from
 * a client module cannot be CALLED on the server — it type-checks, passes every
 * unit test, and answers 500 at runtime.
 */
export const LINK_FAILURES = ["link_conflict", "denied", "failed"] as const;
export type LinkFailure = (typeof LINK_FAILURES)[number];
export type LinkOutcome = "linked" | LinkFailure;

export function isLinkFailure(value: unknown): value is LinkFailure {
  return (LINK_FAILURES as readonly unknown[]).includes(value);
}

export function isLinkOutcome(value: unknown): value is LinkOutcome {
  return value === "linked" || isLinkFailure(value);
}
