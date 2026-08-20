# FE↔BE contract gap registry

RUK-254. One row — one discrepancy between what the frontend reads and what
actually arrives on the wire.

**The registry is executable, not decorative.** Every row is checked by
[`tests/contracts/contract-gaps.test.ts`](../tests/contracts/contract-gaps.test.ts)
against the recorded fixtures in `tests/fixtures/wire/`. The backend starts
sending a field → the test fails with "gap is stale". That is what keeps the
registry from turning into a graveyard — exactly the failure that let the
`total > 200` trigger fire 53 times unnoticed.

**The fixture is the source of truth, not the ticket.** Every row below was
verified byte-wise against the recorded response. Ticket claims that did not
survive that check are moved to a separate section rather than deleted quietly:
a wrong entry in the registry is more dangerous than a missing one, because
people cite it.

**Boundaries (SPEC §5).** Nothing is fixed here. A discrepancy is recorded, and
the owner files or updates the ticket. A row is deleted only together with the
feature being turned on.

---

## Class B — the frontend reads a field, the backend does not send it

| Field       | Where it is needed                        | What is on the wire                       | Ticket  | Stub                        |
| ----------- | ----------------------------------------- | ----------------------------------------- | ------- | --------------------------- |
| `resources` | calendar: nothing (the field is no longer read) | no such key in the `CalendarEventDto` event | RUK-256 | `maintenance-mapper.ts:236` |

**The gap is closed, but not in the way this row originally prescribed.** The
earlier revision called for "filling the field in the mapper" once the backend
started sending it. Under RUK-256 the backend answered that it will not start:
`GET /ui/v1/calendar` takes `resource_ids` as a FILTER and returns an
already-narrowed result, so resource data is not needed in the response. The
filter moved to the server, `matchesFilters` now checks `scope` only, and
`resourceOptions` was deleted.

**The row stays here because the stub in the mapper is still alive.**
`resources: []` is still written onto every event, and the registry is obliged
to name it — otherwise the grep in
[`contract-gaps.test.ts`](../tests/contracts/contract-gaps.test.ts) would see an
unregistered stub. The field has no readers, though: the doc comment in
[`maintenance.ts`](../src/domain/maintenance/maintenance.ts) marks it as dormant
and forbids building anything new on it.

**What is left to do** (not urgent, breaks nothing): drop the field from
`CalendarEvent`, drop `resources: []` from `mapCalendarResponse` and from
`MOCK_CALENDAR_EVENTS`, fix four assertions in
`calendar-payload.contract.test.ts`, move this row to Class C, and relax the
`expect(stubbed.length).toBeGreaterThan(0)` precondition — after the removal it
is the calendar mapper's only stub, so it would bring down its own check. A
step-by-step breakdown was in `SPEC.md` §8.0 on the `feature/ruk-256` branch.

**Why `resources` is not "legitimately empty".** The detail endpoint
(`/ui/v1/maintenances/{id}`) returns `resources` populated — two of them in the
recorded fixture. The calendar does not send the key at all. This is a
difference between the CONTRACTS of two endpoints, not missing data, and that is
precisely why a type-level reconciliation does not catch it (SPEC §4.2). That
asymmetry was the cause of the defect: the sidebar filtered on a field that is
not on the wire, while the unit tests stayed green because they ran on
hand-written fixtures with non-empty `resources`.

---

### `updated_at` on channels — declared by the frontend, never arrives

| Field        | Where it is needed                        | What is on the wire                     | Ticket  | Stub                          |
| ------------ | ----------------------------------------- | --------------------------------------- | ------- | ----------------------------- |
| `updated_at` | `NotifyChannel.updatedAt`, channel detail | the key is absent from **all** 200 rows | RUK-274 | `notify-channel-mapper.ts:49` |

The DTO promises "Null until the channel is first edited", i.e. a key holding
`null`. Verified on 200 items of live output: the key is not there at all. The
mapper substitutes `""`, so the domain-level `updatedAt` is always empty — not
just for channels that were never edited.

**This row is prose, not executable, and that needs to be known.**
`contract-gaps.test.ts` is pinned to `maintenance-mapper.ts` (`MAPPER_PATH`) and
scans `mapCalendarResponse` only, so no check covers this row. Widening the scan
is scope growth beyond RUK-274; it is said plainly here so the row does not look
protected by a mechanism it does not have.

---

## Class C — the frontend no longer requests the field

The gap was not closed — it became **unreachable**: the frontend stopped reading
the field, so there is nothing left to go missing. The rows are not deleted —
they explain why the fields disappeared from the code, and what would have to
happen for them to come back.

| Field            | Where it was needed                                | What happened                                                                            | Ticket  |
| ---------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------- |
| `notify_targets` | calendar: displaying notification channels          | removed from the calendar type: the screen never shipped, and the mapper synthesized `[]` | RUK-258 |
| `steps`          | calendar: previewing steps without opening the detail | same — the stub cost bytes on every event and gave nothing back                          | RUK-258 |

**How to bring them back.** Both fields exist on the detail endpoint and are
populated in `mapMaintenanceView`. If the product decides to show them directly
on the grid, the order is: first the backend adds the field to
`CalendarEventDto`, then it is declared on `CalendarEvent` — and only then does
it appear in the mapper. The reverse order (declaring it on the type "just in
case") is exactly the defect RUK-258 removed.

---

## Class B′ — the backend sends it, the frontend does not read it

The opposite direction. It does not break a screen, but it means data the
backend has already computed never reaches the operator.

| Field                    | What is on the wire                                                                                    | Where it is lost                                                                                                                                                                 | Ticket |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| ~~`facets.integration`~~ | **CLOSED** — the field is declared in `AuditFacetsDto` and in the domain `AuditFacets`, the counter reaches the domain | —                                                                                                                                                                                | —      |
| `prune-*` (action)       | the backend sends the service actions `prune-expired`/`prune-none`                                      | `mapAuditAction` ([`audit-mapper.ts:36`](../src/server/backend/contracts/audit-mapper.ts)) returns `undefined` for an unknown action, and the route **discards the whole row** | —      |

**`prune-*` is the most serious entry in this file.** The other discrepancies
mean "a field did not arrive"; this one means **"a row did not arrive"**. In a
snapshot of 12 records, 10 reach the client: the security log silently shows
less than what happened. Found by the assertion `does not silently drop recorded
rows the domain enum has not heard of`
([`audit-log.contract.test.ts`](../tests/contracts/audit-log.contract.test.ts)) —
the very one whose comment described exactly this scenario in advance as "drift
arriving".

It is fixed by adding the actions to the domain enum, but the decision belongs to
the owner: possibly the service `prune-*` actions are not needed in the UI at
all, in which case the correct fix is to filter them out **explicitly** rather
than lose them to a hole in the whitelist. Right now the assertion lets only
`prune-*` through; any **new** unknown action will fail the test and name itself.

**`facets.integration` — closed, and the first gap this mechanism closed
end-to-end.** The backend sends six counters
(`all/auth/roles/block/maintenance/integration`), the DTO declared five — the
sixth was dropped in `mapAuditFacets`. Found by **reconciling the fixture against
the DTO**, not by eye: the value on the dev seed is `0`, so a visible symptom
could not exist in principle. The field is now declared and the assertion in
`contract-gaps.test.ts` is **inverted** — it now fails if the field is ever
removed again.

**What is deliberately left open:** there is no visible "Integration" tab. The
counter reaches the domain, but `AuditCategory` (`audit-presentation.ts:49`) does
not know about it, and `CATEGORY_ACTIONS` needs integration actions that
`AUDIT_ACTIONS` does not have yet. That is a product decision rather than a
mapping fix — recorded instead of done quietly. The "counter only" assertion
inverts when the tab ships.

---

## Unproven captures — the fixture proves no row shape

Not a discrepancy but a **hole in the evidence**. The fixture is captured, the
endpoint is "covered", but the recorded response is empty and pins no field of a
row. Counting that as coverage is the same class-B mistake, only from the testing
side.

| Endpoint            | What is recorded                                                    | What is missing                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/ui/v1/approvals`  | `{maintenances: [], total: 0}`                                      | not a single queue row → the shape of `ApprovalRowDto` is unverified                                                                                                |
| `/api/v1/audit/log` | the 12 newest rows; the contents of the window change between captures | neither `entity_type: "maintenance"` (→ `metadata.maint_title` unverified) nor rows with `actor_display_name` — which actions land in the window is decided by timing |

**Why the audit capture cannot be closed by re-capturing** (verified: the attempt
was made and rolled back). One capture brought in 12 `maintenance` rows, the
assertion was rewritten into a requirement — and the next capture lost them. The
cause is twofold: the log is **time-ordered** and `limit=20` returns the newest
rows, and **the capture pollutes its own subject** — every `fixtures:refresh`
performs a dev-bypass login, which writes `login.success` rows and pushes older
rows off the page. Requiring a shape that appears only some of the time means
writing a test that fails on a Tuesday through nobody's mistake.

It is closed not by a test but by selection: the capture needs an `entity_type`
filter. The endpoint does not currently accept such a parameter (verified against
`src/app/api/audit/route.ts` — it is not in the whitelist) → that is a request to
the backend, as a separate ticket.

The `approvals` row is closed by seed data (a maintenance awaiting approval), not
by a cleverer test, and it self-expires: as soon as the capture stops being
empty, the test fails and asks for the row to be deleted.

**The lesson cost four rewritten assertions.** About `actor_display_name` it was
successively claimed: "present on all 12 rows" → "present on every row with an
`actor_id`" → "present on at least one". Each was a **tally over a single
capture** passed off as an invariant, and each was broken by the next capture.
The rule worth taking away: you may assert what does not depend on the contents
of the window — the type of a value where that value exists. Everything else
about this endpoint stays a census until the capture learns to select rows.

---

## Checked and NOT confirmed

Claims that sounded like discrepancies, but the wire refuted them. Kept here so
they do not get filed again.

| Claim                                                                | What is actually the case                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actor_display_name` is absent from the audit log (RUK-171)          | **False — but "always present" is false too.** The field rides on the ACTION: `roles.changed` and `maintenance.*` carry it, `login.success` carries an `actor_id` without it, `prune-*` carries neither. The ticket's "never sent" is refuted; the rule "always sent" is refuted as well — see below |
| calendar `created_by` is a display name only, without an id (RUK-192) | **Stale.** The event carries `created_by` as an object with `id`/`display_name`/`email`. The blocker of the cancelled RUK-192 is lifted — the decision is the owner's (SPEC §10.3)                                                                                                |
| `timezone` never reached the backend (RUK-202)                       | **False.** The key is present in `/api/v1/me`; the value `null` means "the user has not chosen one", not "the field is missing"                                                                                                                                                   |

The confirmed half of RUK-171 stands: `details` arrives as a **flat string**
(`"login success for …"`) rather than a structured object. Rich diff rendering
cannot be built on that data. It is checked by a test; when the backend starts
sending an object the test will fail — and that will be the signal that the
feature can be turned on.

---

## Notify channel catalogue (RUK-274)

Two entries that are not about fields but about **endpoint behavior**, so they do
not fit any of the classes above. Both were measured with live requests on
2026-08-15 against a seeded database; both are prose — there is nothing to
execute them with (see the `MAPPER_PATH` caveat above).

### Sorting — not "newest-first", but by an invisible field

`GET /api/v1/notifications/channels` does **not** sort by creation date. Measured
over 200 items: 149 of 199 adjacent pairs run against a descending `created_at`.
The actual key is **`transport_channel_id` ascending** (verified: strict ASC
across all 200; by `id` and by `name` the order is unsorted).

The endpoint accepts no sorting parameters: `sort`, `order_by`, `sort_by` and
`order` all answer 200 and leave the order unchanged.

A previous comment in `notify-channel-mapper.ts` asserted that "the backend
already sorts newest-first". That was an **unverified frontend belief** — exactly
the class this file exists for. The comment has been corrected to the measured
fact; the ordering itself is not fixed (RUK-274 — detection and repair are
separate changes).

**What this means for the operator.** The catalogue is sorted by a field that
does not appear in the UI, so "newest on top" will not happen. Pagination is safe
regardless: the key is stable and unique, pages neither overlap nor lose rows
(verified — `offset=0` and `offset=10` do not intersect, and two pages of 10
equal one `limit=20` element for element).

**Fixed on the backend**: either `ORDER BY created_at DESC` or a sorting
parameter. Until then the frontend shows what it was sent.

### Search matches the name only — a channel can no longer be found by transport or channel id

`name` is the only working search parameter (`search`, `q`, `query` and `filter`
are accepted with a 200 and an **unfiltered** list). The match is a substring,
case-insensitive, **on the `name` field only**: verified by control — a string
from `description` yields `total=0`, `slack` from `transport` yields 0, and
`TestCreateMany` from `transport_channel_id` yields 0.

This is a **narrowing relative to the frontend's previous behavior**, and it was
introduced by this very task. Before RUK-274 the channel picker was filtered
client-side through cmdk on `searchValue`, which included `name`, `transport` and
`transport_channel_id` — meaning a channel could be found by typing its slack id.
Server-side search turns client-side filtering off (`shouldFilter={false}`), and
those two fields stop being searchable.

The trade-off is deliberate: without server-side search roughly 96% of the
catalogue is unreachable (3617 rows against a page of 50). But the loss is real
and is recorded here rather than left to be discovered in production.

**Fixed on the backend**: widen the match from `name` to `transport_channel_id`
(and possibly `description`), or add a separate parameter.
