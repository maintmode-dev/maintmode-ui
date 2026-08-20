# Calendar Month Packing Contract

Goal: pin down a single algorithm for packing events into the `month view`, based on the observed behavior of Apple Calendar, so that every agent stage (`fe-architect`, `fe-dev`, `fe-ui-inspector`, `fe-ux-reviewer`, `fe-gate`) verifies the same thing.

## Scope
- Applies to `month view` only.
- Does not change the `day/week` rendering rules.

## Terms
- `segment` — the weekly fragment of an event in the month grid (an event is pre-sliced along week boundaries).
- `spanning` — an event occupying more than one calendar day.
- `timed-single-day` — an event within a single calendar day at a specific time.
- `visible_rows_limit` — the maximum number of visible event rows in a day cell.

## Normative packing rules (mandatory)
1. Unit of layout: the week. Before placement, an event is sliced into `segment`s along week boundaries.
2. Within a week, `first-fit` is used: each `segment` goes into the topmost free track that does not overlap by day.
3. Packing priority: `spanning` above `timed-single-day`.
4. A `spanning` event must render as a continuous bar across every day of its weekly segment.
5. A `timed-single-day` event occupies only its own date and does not reserve neighboring days.
6. `visible_rows_limit` for month view is fixed at `5`.
7. `+N more` is always displayed at the bottom of the day cell (after the visible event rows).
8. `N` counts the hidden `segment`s of that specific calendar day; the counter is not shared between neighboring days.
9. After a single event is added or removed, the upper visible tracks must not rearrange chaotically (deterministic layout).

## Text behavior in month view
1. For `timed-single-day`, the start time is shown.
2. For `spanning`, an end marker on the segment's final day (`ends HH:mm`) is allowed where space permits.

## Verification baseline (case Feb 23 - Mar 1)
1. `23 Feb`: exactly 5 visible rows, no `+N`.
2. `24 Feb`: overflow by 1 -> `+1 more`.
3. `25 Feb`: heavy overflow -> `+4 more` (after adding 1 event -> `+5 more`, after removing it back to `+4 more`).
4. `26-27 Feb`: a mix of single-day and multi-day events, `+N` counted per date separately.
5. `28 Feb` and `1 Mar`: week boundary crossing, counter and layout independent for each date.
6. Adding an event on `24-27 Feb` lifts it into the top track and redistributes overflow on the affected days.

## Recommended baseline on the FullCalendar API
- Use standard FullCalendar mechanisms as the source of behavior:
  - `eventOrder`
  - `eventOrderStrict`
  - `dayMaxEventRows` / `dayMaxEvents`
  - `eventContent`
  - `moreLinkClick`
- A custom layout is permitted only if the behavior cannot be obtained through the built-in APIs.

## Verifiable acceptance checks (for UI/UX/Gate)
1. On a day holding both `spanning` and `timed-single-day` events, the `spanning` ones are visible first.
2. A `spanning` event is not interrupted inside its weekly segment.
3. On overflow, no more than 5 rows are visible and `+N more` sits strictly at the bottom of the cell.
4. `+N` is counted independently for different days of the same week.
5. After adding/removing a single event, the layout of the upper tracks is deterministic and predictable.
6. In month view, start times are visible for `timed-single-day` events; for long events, the readability of the segment's end is preserved.
