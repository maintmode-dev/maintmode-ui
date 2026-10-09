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

| Field       | Where it is needed                              | What is on the wire                         | Ticket  | Stub                        |
| ----------- | ----------------------------------------------- | ------------------------------------------- | ------- | --------------------------- |
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

### `refresh_token` on a grace refresh — CLOSED 2026-10-09

| Field           | Where it is needed                                       | What is on the wire                                                                                | Ticket | Status                                   |
| --------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------- |
| `refresh_token` | `refreshBackendToken`, `refreshAndPersist` (BFF refresh) | absent (`omitempty`) when the token presented was rotated less than 30s ago (`refreshWithinGrace`) | —      | closed — the BFF reads absence as "keep" |

`POST /api/v1/refresh` rotates on every call. A second request presenting the
just-rotated token inside `refresh_token_grace_period` (30s) — a parallel tab,
or a request that left the browser before the winner's cookie came back — gets
a fresh access token and an EMPTY refresh token, meaning "keep the one you
have". The BFF's shape check demanded both tokens and threw, and
`refreshAndPersist` answered every throw with `clearActiveSession()`: the losing
request signed the user out, and its cookie-clear could land in the browser
after the winner's fresh cookie. Pinned by the declared fixture
[`refresh.json`](../tests/fixtures/wire/refresh.json) (`grace`).

**How it was closed.** `refreshBackendToken` requires the access token only. An
absent or empty `refresh_token` serves the new access token to THIS request and
leaves the cookie as it is — an empty refresh token is never written. A reply
that does carry one (the backend may return the successor during grace) is a
rotation like any other. Each settled refresh stays the answer for the token it
spent for 60s, so a straggler still carrying the old cookie gets the identical
pair instead of spending the token again.

The same failure path hid three neighbouring discrepancies:

- **Lock busy is 429, not 409.** The swagger on `Refresh` documents 409 "Refresh
  lock busy or token reuse"; the code answers `ErrLockBusy` with **429**
  `lock is already held` and `Retry-After: 1`, and reuse with **401**. The BFF
  now retries 429 and 409 alike — plus 5xx and a network error — once, after
  `Retry-After` (capped at 2s), and then fails the request with 503
  `BACKEND_UNAVAILABLE`, keeping the cookie. The swagger itself is the
  backend's to correct.
- **Only a 401 ends a session.** Reuse past grace, logout, idle/absolute expiry
  and an unknown token all answer **401 `unauthorized`** (`unauthorizedErrors`
  in `httperrors/mapper.go`). That is now the only refresh answer that clears
  the cookie; it used to be every failure.
- **The cookie outlives the session — still open.** The backend ends a session
  `session_max_lifetime` (720h) after sign-in, carried across rotations as
  `SessionStartedAt`, and exposes that instant nowhere (no claim, no response
  field); the BFF re-arms the session cookie for 30 days on every refresh, so
  its lifetime has no relation to the session's. Repaired separately.

Kept executable by `contract-gaps.test.ts` ("refresh grace reply", now asserting
the reply is ACCEPTED, so the gap cannot quietly reopen) and by
[`refresh.contract.test.ts`](../tests/contracts/refresh.contract.test.ts), which
drives every declared shape through the real session code.

---

## Class C — the frontend no longer requests the field

The gap was not closed — it became **unreachable**: the frontend stopped reading
the field, so there is nothing left to go missing. The rows are not deleted —
they explain why the fields disappeared from the code, and what would have to
happen for them to come back.

| Field            | Where it was needed                                   | What happened                                                                             | Ticket  |
| ---------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------- |
| `notify_targets` | calendar: displaying notification channels            | removed from the calendar type: the screen never shipped, and the mapper synthesized `[]` | RUK-258 |
| `steps`          | calendar: previewing steps without opening the detail | same — the stub cost bytes on every event and gave nothing back                           | RUK-258 |

**How to bring them back.** Both fields exist on the detail endpoint and are
populated in `mapMaintenanceView`. If the product decides to show them directly
on the grid, the order is: first the backend adds the field to
`CalendarEventDto`, then it is declared on `CalendarEvent` — and only then does
it appear in the mapper. The reverse order (declaring it on the type "just in
case") is exactly the defect RUK-258 removed.

---

### `password_set` on /me — CLOSED 2026-09-08 (RUK-289)

| Field          | Where it is needed                                  | What was on the wire                     | Ticket  | Status                        |
| -------------- | --------------------------------------------------- | ---------------------------------------- | ------- | ----------------------------- |
| `password_set` | profile password card, `/set-password` (RUK-289 UI) | the key was absent from the recorded 200 | RUK-289 | closed — backend now sends it |

The backend that serves this field was written on a branch while the frontend
was built, so the recorded fixture predated it and the field arrived as
`undefined`. That branch is merged, `me.json` is re-recorded, and the key is on
the wire as a real boolean.

**The row is kept rather than deleted, per this file's convention for a closed
gap** — a reader who finds `password_set?: boolean` optional in
`src/domain/admin/user.ts` should be able to learn why. The optionality stays
deliberately: `undefined` still means "the deployed backend predates the field",
which is a real state for any instance not yet on this version, and the UI keeps
treating it as "unknown" rather than as `false`. Collapsing the two would draw a
set-password form for every operator on such an instance, whose every save is
then a 400.

**How it was detected, and why that mattered.** The mechanism was a mirror
assertion — `contract-gaps.test.ts` asserted the key was ABSENT from `me.json`,
so it was green while the gap was open and went red the moment the fixture was
re-recorded. It fired exactly as designed, which is how this row came to be
closed rather than quietly forgotten. Both the assertion and the gap are gone.

The first version of this row claimed a different detector — the key-set
comparison in `me.contract.test.ts` — and that claim was wrong. That assertion
compares the route's echo against the same fixture that fed its mock: a tautology
on key sets, green whatever the fixture holds. It proves the route narrows
nothing and says nothing about which fields exist. Recorded here because a
detector that cannot fire is worse than an acknowledged absence of one.

## Class B′ — the backend sends it, the frontend does not read it

The opposite direction. It does not break a screen, but it means data the
backend has already computed never reaches the operator.

| Field                    | What is on the wire                                                                                                                                                                                                                                                                      | Where it is lost                                                                                                                             | Ticket  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| ~~`facets.integration`~~ | **CLOSED** — the counter reached the domain; the key itself was retired in v0.3.1 (integration events count under `settings`), and the check now covers every wire facet key                                                                                                             | —                                                                                                                                            | —       |
| ~~`prune-*` (action)~~   | **CLOSED — false alarm.** Not a backend contract: per-run markers (`prune-expired-<id>` / `prune-limit-<id>` / `prune-none-<id>`) written into audit_log by the backend's own test `internal/storages/audit/prune_test.go`, which leaked into the database the fixture was captured from | — (fixture cleaned; nothing is filtered)                                                                                                     | —       |
| ~~5 audit actions~~      | **CLOSED** 2026-10-08 — `AUDIT_ACTIONS` declares every action the backend publishes (23 then, 33 since backend `3c1609f`), and an action it does not know is rendered instead of dropped                                                                                                 | —                                                                                                                                            | RUK-297 |
| collection-change flags  | `maintenance.updated` names a supplied `steps`/`resources`/`notify_targets` as `{field}` with no `old`/`new`                                                                                                                                                                             | `mapChanges` ([`audit-mapper.ts`](../src/server/backend/contracts/audit-mapper.ts)) reads a change with neither side as a no-op and drops it | —       |

**`prune-*` — CLOSED 2026-10-08 as a false alarm.** This row used to call itself
"the most serious entry in this file": `audit-log.json` held two rows with an
action of `prune-expired-<id>` / `prune-none-<id>`, the mapper's allowlist
dropped them, and the reading was "the backend started emitting service `prune-*`
actions and the security log silently shows less than happened". The rows were
real, the reading was not. No non-test backend code writes such an action — it
is not in `entity.AuditAction`, and `IsValid()` rejects it. They are per-run
markers that `internal/storages/audit/prune_test.go` (backend `8634b23f`,
RUK-180) inserts into `audit_log` and partly leaves behind, and the fixture was
captured from a database those tests had run against.

So the fix is to the evidence, not the code: the two rows are removed from
`audit-log.json` (declared as a trim in its manifest entry), and the exception
that let `prune-*` through the "nothing is dropped" assertion in
[`audit-log.contract.test.ts`](../tests/contracts/audit-log.contract.test.ts) is
gone — that assertion is strict now. (`audit-log.json` has since been
re-captured for the v0.3.1 facet keys from the self-host stand, whose database
the backend's tests never touched, so the trim no longer applies.) There is
deliberately **no** `prune-*`
filter in `src/`: if such rows appear on a dev stand after the backend's tests,
they render as a generic unknown-action row under **All** (see below), which is
the honest outcome. Lesson recorded for the next capture: a row on the wire is
not automatically a contract — check what wrote it. (Backend `eb62350` makes
those tests delete their own marker rows, so a fresh run no longer leaves any.)

**Five audit actions — CLOSED 2026-10-08 (RUK-297).** The backend declares 23
actions; `AUDIT_ACTIONS` ([`audit-log.ts`](../src/domain/audit/audit-log.ts))
declared 18, and the mapper's allowlist dropped every row of the other five on a
200, with no error: `auth_method.toggled`, `password.changed`, `password.reset`,
`provider.linked`, `user.tags_changed`. The category chips made it worse — a chip
filters by sending the UI's own known actions as an `action` CSV, so the backend
facet counted rows no chip ever asked for (observed on the self-host stand: All
total 46, rows 45).

Closed as a class, not as five entries:

- **The five are modelled** — label, colour and chip, following the backend's own
  category map (`auditActionCategories`, `internal/entity/audit.go`). Since the
  v0.3.1 regroup that puts `password.changed`, `password.reset`,
  `provider.linked` and `user.tags_changed` on **Users** and
  `auth_method.toggled` on **Settings** (they were on Auth / Roles before).
- **An unknown action is rendered, not dropped.** The mapper carries the wire
  value through; `AuditEvent.action` is typed `AuditEventAction` (a known
  `AuditAction` or a plain string), the label falls back to the raw value and the
  dot to a neutral token. Such a row shows under **All** only — the chips ask the
  server for known actions, so it cannot appear under one.
- **Drift fails CI.** [`audit-actions.contract.test.ts`](../tests/contracts/audit-actions.contract.test.ts)
  compares `AUDIT_ACTIONS` both ways with the backend's published
  `entity.AuditAction` enum, vendored verbatim from its OpenAPI spec into
  `tests/fixtures/wire/audit-action-enum.json` by `npm run fixtures:audit-actions`
  (the spec is not on the wire, and CI cannot read the backend checkout). It also
  fails when a published action sits under no chip, or under several. There is
  no All-only exception any more: the v0.3.1 regroup gave every action a chip
  and `ALL_ONLY_ACTIONS` was removed, so only an action this build does not
  model shows under **All** alone. Refresh the vendored copy whenever the backend
  changes the enum.
- **Rows are pinned from the wire.** `audit-log-security-events.json` holds the
  five actions as the backend wrote them on the self-host stand; see its manifest
  entry for which rows are captured and how.

The earlier reason not to fix — `password.changed`/`password.reset` missing from
the backend's `IsValid()`, which gates the read filter — is gone: backend main
lists all 23.

**Ten more actions — 2026-10-09 (backend `3c1609f`).** The backend began
auditing invitations (`invitation.created` / `invitation.revoked`, on **Users**)
and the resource and notify-channel catalogs (`resource.*` /
`notify_channel.*` created / updated / archived / unarchived, on **Settings**).
The vendored enum was refreshed and the drift guard named all ten; they are
modelled with label, colour and chip. They carry no new metadata fields: an
invitation row fills `target_email` + `roles`, a catalog row fills
`target_display_name` (+ `changes` on `*.updated`), so the existing Target /
Roles / Changes rows of the expanded detail render them.

**`facets.integration` — closed, and the first gap this mechanism closed
end-to-end.** The backend sent six counters
(`all/auth/roles/block/maintenance/integration`), the DTO declared five — the
sixth was dropped in `mapAuditFacets`. Found by **reconciling the fixture against
the DTO**, not by eye: the value on the dev seed is `0`, so a visible symptom
could not exist in principle. The field was declared and the assertion in
`contract-gaps.test.ts` **inverted** to fail if it were ever removed again.

**Superseded by the v0.3.1 chip regroup (2026-10-08, owner-approved).** The
open question this row used to carry — "there is no visible Integration tab;
integration events are `ALL_ONLY_ACTIONS`" — is answered: the backend and the
UI now group actions into **Sign-ins / Users / Settings / Maintenance**, every
action in exactly one, and integration events sit under **Settings** with
`auth_method.toggled`. The facet keys changed with it
(`all/sign_in/users/settings/maintenance`; `auth`, `roles`, `block` and
`integration` are gone), `ALL_ONLY_ACTIONS` was removed, and the registry check
was generalised from "`integration` is declared" to "every facet key in the
recorded response is declared in the DTO and the domain type" — the same defect
for whatever counter comes next. The old `auth` key also took a normaliser false
positive with it: `SENSITIVE_KEY_RE` masked that count into the string
`"<redacted-auth>"`; none of the new keys match the rule, and the contract test
now asserts every recorded facet is a number.

**Collection-change flags on `maintenance.updated`.** The backend records a
supplied `steps`, `resources` or `notify_targets` as a change with no `old`/`new`
(`addCollection` in `internal/services/maint/update_maint.go`) — a "changed"
flag, the same convention `integration.updated` uses for `secrets.<key>`.
`mapChanges` drops a change with neither side as a no-op, and its comment calls
these "no-op entries for untouched fields", so the audit row of a maintenance
whose steps were replaced says nothing about the steps. Found 2026-10-08 while
keeping the `secrets.<key>` flag (which is now exempt); not fixed here, because
whether "supplied" should read as "changed" on screen is a decision for the
owner, not a drive-by.

---

## Unproven captures — the fixture proves no row shape

Not a discrepancy but a **hole in the evidence**. The fixture is captured, the
endpoint is "covered", but the recorded response is empty and pins no field of a
row. Counting that as coverage is the same class-B mistake, only from the testing
side.

| Endpoint            | What is recorded                                                       | What is missing                                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/ui/v1/approvals`  | `{maintenances: [], total: 0}`                                         | not a single queue row → the shape of `ApprovalRowDto` is unverified                                                                                                  |
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

| Claim                                                                 | What is actually the case                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actor_display_name` is absent from the audit log (RUK-171)           | **False — but "always present" is false too.** The field rides on the ACTION: `roles.changed` and `maintenance.*` carry it, `login.success` carries an `actor_id` without it. (An earlier capture also held `prune-*` rows carrying neither — backend test residue, since removed.) The ticket's "never sent" is refuted; the rule "always sent" is refuted as well — see below |
| calendar `created_by` is a display name only, without an id (RUK-192) | **Stale.** The event carries `created_by` as an object with `id`/`display_name`/`email`. The blocker of the cancelled RUK-192 is lifted — the decision is the owner's (SPEC §10.3)                                                                                                                                                                                              |
| `timezone` never reached the backend (RUK-202)                        | **False.** The key is present in `/api/v1/me`; the value `null` means "the user has not chosen one", not "the field is missing"                                                                                                                                                                                                                                                 |

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
