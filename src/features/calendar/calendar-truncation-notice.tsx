import { TriangleAlert } from "lucide-react";
import type { ReactElement } from "react";

import { Alert, AlertDescription } from "@/shared/ui/shadcn/alert";

import type { CalendarMeta } from "./queries/use-calendar-query";

/**
 * The backend caps the calendar window at 1000 events. Until now it did so
 * silently, so an operator surveying a busy month saw a plausible-looking grid
 * with work missing from it and no way to tell (RUK-252). This is that signal.
 *
 * The copy is FIXED by owner decision (plan §6.1). The app has no i18n layer
 * (no `next-intl`/`react-intl`/`lingui`, no message catalogue); every
 * user-facing string in this codebase is inline, so this one is too. It lives
 * in a named constant rather than in the JSX only so the test can pin it
 * character for character.
 *
 * Do not reword it. Each clause was chosen against a rejected alternative:
 *   - "Showing the first …" states a FACT, not a failure — the system did what
 *     it was designed to do. ("Not all maintenances are shown" was rejected:
 *     it reads as a malfunction rather than a cap doing its job.)
 *   - "narrow your filters" is a concrete action that does not dictate one
 *     specific fix. ("switch to week view" was rejected: the operator opened
 *     the month deliberately; "Too many maintenances, refine your filters" was
 *     rejected: it leaves unclear whether anything is missing at all.)
 *   - "to see more", not "to see them all" — narrowing is not promised to be
 *     sufficient, so the text must not promise a complete result.
 *
 * The QUANTITY comes from the response (`meta.count`), never from a constant.
 * The cap is the backend's to choose and it reports what it actually returned;
 * hardcoding 1000 here would keep passing every test (the fixtures say 1000)
 * while telling the operator a specific false number the day the cap moves — a
 * confidently wrong count is worse than the silent truncation this closes.
 * `TRUNCATION_MESSAGE_NO_COUNT` covers a backend that flags `truncated` without
 * a `count` (both fields are optional): same clauses, no quantity claimed. It
 * says "a partial window" rather than naming a number, keeping the same
 * factual register instead of degrading into a failure report.
 */
const truncationMessage = (count: number): string =>
  `Showing the first ${count} maintenances — narrow your filters to see more`;

const TRUNCATION_MESSAGE_NO_COUNT = "Showing a partial window — narrow your filters to see more";

/**
 * Is the window known to be truncated?
 *
 * Strictly `=== true`. `meta` is `undefined` on EVERY navigation, not only on
 * error: `keepPreviousData` keeps the previous window's `items` on screen while
 * the next one loads, and no cache entry exists under the new key yet. A
 * loose check (`!meta?.truncated`, or a plain truthiness test) would therefore
 * flicker the notice on every prev/next AND silently convert "we don't know"
 * into "not truncated" — which is the exact silent-hiding defect this closes.
 *
 * So there are three states, not two: true → tell the operator; false → say
 * nothing, we know the window is complete; undefined → say nothing, because we
 * do not know. The last two render identically but mean different things, and
 * the UI must never turn the third into a claim of completeness.
 */
export function isTruncated(meta: CalendarMeta | undefined): boolean {
  return meta?.truncated === true;
}

/**
 * Renders the notice, or `null` when the window is not KNOWN to be truncated.
 *
 * Returning `null` outright (rather than an empty or hidden wrapper) is what
 * keeps the layout from shifting: in the not-truncated case there is no node at
 * all, so nothing occupies a slot in the parent's flow and the grid sits exactly
 * where it does today.
 */
export function CalendarTruncationNotice({ meta }: { meta: CalendarMeta | undefined }): ReactElement | null {
  if (!isTruncated(meta)) return null;

  // Only a finite number is worth showing. `count` is optional and arrives from
  // the backend, so anything else (absent, NaN, Infinity, a non-number that beat
  // the type) falls back to the quantity-free wording rather than rendering
  // "the first undefined maintenances".
  const count = meta?.count;
  const message =
    typeof count === "number" && Number.isFinite(count)
      ? truncationMessage(count)
      : TRUNCATION_MESSAGE_NO_COUNT;

  return (
    <Alert
      data-testid="calendar-truncation-notice"
      variant="warning"
      // `role="status"`, not Alert's default `alert`: this is present as soon as
      // the window resolves rather than raised by an operator action, and an
      // assertive live region would interrupt the screen reader's first pass.
      // Same reasoning as the seats indicator and the channel delivery callout.
      role="status"
      className="px-3 py-2 text-xs [&>svg]:size-3.5"
    >
      <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
      {/*
        `text-fg` rather than the variant's default description colour: that
        default is `--fg-muted`, which sits at 1.78:1 on the amber wash in dark
        mode. The variant is tuned for descriptions sitting under a coloured
        title, and this alert has no title — it is a single line.
      */}
      <AlertDescription className="text-xs text-fg">{message}</AlertDescription>
    </Alert>
  );
}
