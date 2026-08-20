# UI Rules — Maintenance Calendar

## RULE-01 Visibility
Events and their key text must be visible without hover.

## RULE-02 Minimum size
An event must stay readable in day/week/month. If space is tight — proper truncation with an ellipsis.

## RULE-03 Conflict indicator
A conflict must have an explicit visual indicator (icon/stripe/badge), visible before the click.

## RULE-04 Planned vs Actual
Planned and actual time must differ visually, not by text alone.

## RULE-05 Overlap readability
Event text must never be allowed to overlap other event text.

## RULE-06 Overflow behavior
In month view, content overflow must be handled cleanly (`+N more`/ellipsis).

## RULE-07 Semantic colors
One meaning = one color. Status meanings must not be mixed within the same color semantics.

## RULE-08 Empty/error/loading states
The `loading`, `error` and `empty` states must be explicit and understandable.

## RULE-09 Interaction affordance
Interactive elements must look interactive (cursor, hover, focus).

## RULE-10 Fail-first
If compliance with a rule cannot be confirmed with confidence — record a FAIL.

## RULE-11 Month packing priority
Month view is governed by the mandatory contract `.agents/project-details/ui-specific/calendar_month_packing.md`:
- packing priority: `spanning` before `timed-single-day`;
- `+N more` only in the bottom row of the cell;
- a timed event must show its start time.
