"use client";

import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/shared/ui/shadcn/alert";

import { useSeatsQuery } from "./queries/use-users-queries";

/**
 * Licensed-seat counters for the users-page header (RUK-220).
 *
 * Shows three numbers side by side rather than one: accepting an invite is
 * net-zero on the occupied total (pending −1, used +1), so a single number
 * would move without explanation. All three are read from the server — the
 * occupied total is never `used + pending` computed here (see `SeatsUsage`).
 *
 * Renders nothing while loading, on error, and when the instance has no
 * ceiling. That is deliberate rather than a skeleton: the block is optional by
 * nature — a self-hosted instance never has one — so reserving space for it
 * would carve a permanent hole in the header of every such install.
 *
 * Known cost of the same choice: a failed request is indistinguishable from
 * "unlimited" to the admin. The backend deliberately fails closed (500 rather
 * than zeroes, since a zero reads as "plenty of room"), and hiding converts
 * that honest error into silence. Accepted because the alternative is a line
 * the admin cannot act on; the compensating check is manual (SPEC §15.1).
 */
export function SeatsIndicator() {
  const { data, isPending } = useSeatsQuery();

  // Hold the line's height while the answer is unknown, so a late response does
  // not resize the header. Locally the response lands in the same frame and CLS
  // reads 0, which hides the shift rather than proving it absent.
  //
  // Reserved only during that window, not permanently: on a self-hosted instance
  // there is never a counter, and a standing placeholder would leave a blank gap
  // under the Invite button forever. One frame of empty space that then
  // collapses for the session is the cheaper trade.
  if (isPending) {
    return <p className="caption mono" aria-hidden={true} />;
  }

  // `!data` here means the request settled without usable data — an error.
  if (!data || data.unlimited) {
    return null;
  }

  // Destructured before the guard so the narrowing lives in `purchased` — a
  // const that later reads cannot lose, unlike `data.seats_purchased`, which
  // widens again the moment it crosses into a helper or a subcomponent.
  //
  // `typeof !== "number"` rather than `=== null`, and applied to **all four**
  // numbers: the BFF forwards the body unvalidated, so a dropped key arrives as
  // `undefined` and a drifted one as a string. Checking only the ceiling would
  // still render "used · pending · of 10 seats" and leak "undefined" into the
  // accessible name — the visible span is aria-hidden, so that label is all a
  // screen reader gets. A string counter is worse than it looks: comparisons
  // below would go lexicographic, and "9" >= "10" is true.
  const { seats_purchased: purchased, seats_used, seats_pending, seats_occupied } = data;
  if (
    typeof purchased !== "number" ||
    typeof seats_used !== "number" ||
    typeof seats_pending !== "number" ||
    typeof seats_occupied !== "number"
  ) {
    return null;
  }

  // A zero ceiling is "no plan provisioned", not "you filled your seats": it
  // happens on a fresh instance and after a downgrade to zero. Warning that no
  // seats are left next to "0 used · 0 pending" reads as a product bug rather
  // than a licence state, so the accent stays off until there is a real cap.
  const atCap = purchased > 0 && seats_occupied >= purchased;
  // The state has to survive into the accessible name: conveying "no seats
  // left" by colour alone fails WCAG 1.4.1. The visible text uses `·`, which
  // screen readers read poorly, so the label restates it in words instead of
  // mirroring the markup.
  const label =
    `Seats: ${seats_occupied} of ${purchased} used, ` +
    `${seats_used} active, ${seats_pending} pending` +
    (atCap ? " — no seats left" : "");

  const counts = `${seats_used} used · ${seats_pending} pending · ${seats_occupied} of ${purchased} seats`;

  // At the cap the line stops being a passive count and becomes the only
  // warning that the next seat invite will be refused — so it changes category,
  // not just colour. At 12px a hue shift and a 12px glyph read as punctuation
  // next to the identically-sized caption above; area (fill + border + padding)
  // is the one perceptual channel that still has room. Same recipe as the other
  // inline warnings in the app (maintenance-edit-mode, notify-channel dialog).
  //
  // `role="status"`, not Alert's default `alert`: this is present on page load
  // rather than raised by an action, and assertive live regions interrupt the
  // screen reader's first pass. The dialog next door keeps `alert` precisely
  // because it appears on selection — the inverse case.
  if (atCap) {
    return (
      <Alert
        data-testid="seats-indicator"
        variant="warning"
        role="status"
        aria-label={label}
        className="w-fit px-3 py-2 text-xs [&>svg]:size-3.5"
      >
        <TriangleAlert className="size-3.5 shrink-0" aria-hidden={true} />
        {/*
          `text-fg` rather than the variant's default description colour: that
          default is `--fg-muted`, which sits at 1.78:1 on the amber wash in dark
          mode — measured, not assumed. The variant is tuned for descriptions
          under a coloured title, and this alert has no title.
        */}
        <AlertDescription className="mono text-xs text-fg" aria-hidden={true}>
          No seats left · {counts}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <p
      data-testid="seats-indicator"
      aria-label={label}
      className="caption mono whitespace-nowrap text-fg-dim"
    >
      <span aria-hidden={true}>{counts}</span>
    </p>
  );
}
