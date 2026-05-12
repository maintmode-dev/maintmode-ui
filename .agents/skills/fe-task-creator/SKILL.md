---
name: fe-task-creator
description: Use this skill to create a frontend task for `maintmode-ui` — Linear by default, local Markdown when requested — with explicit scope, contracts, source-of-truth grounding, and verification expectations.
---

# FE Task Creator

## Purpose

Create a project-specific frontend task for `maintmode-ui`. The task is the
single brief that the implementer (and all reviewers) read; it must capture
what to build, what is in/out of scope, what contracts to preserve, what
counts as done, and how done is verified.

## Storage

Tasks can be stored in either:

- Linear, using the bundled Linear plugin;
- local Markdown files under `.agents/tasks/<backlog|todo>/<task-id>/<task-id>.md`.

Use Linear by default unless the user explicitly requests a local task file,
Linear is unavailable, or the task must stay local for repository-only
workflow reasons.

When creating the task in Linear:

- use the same task structure and technical-English content required by this
  skill;
- use the Linear issue key or number, for example `RUK-123`, as the task
  identifier after the issue is created;
- set `Task ID` and `Task File` to the Linear issue key or number instead of
  a local path;
- include repository-local paths, contracts, and validation details in the
  Linear issue description;
- do not also create a local task file unless the user asks for a mirrored
  local copy.

When creating the task locally, save it to one of:

- `.agents/tasks/backlog/<task-id>/<task-id>.md` for queued work;
- `.agents/tasks/todo/<task-id>/<task-id>.md` for activated work.

Local task ids may follow `fe-XX` (e.g. `fe-19`) when not Linear-backed.

Apply the base contract from `../task-creator/SKILL.md`. If this skill
conflicts with the universal skill, this skill is the narrower contract.

## Language Rules

Write task titles and saved task files in concise technical English.
User-facing tasking summaries in chat may use the conversation language
unless the user explicitly requests English.

Keep the following as literals when relevant: code identifiers, route paths,
API fields and endpoint names, literal UI labels that are part of the
product contract, skill names, exact file paths.

Do not mix Russian and English inside the task file.

## When To Use

Use this skill when the request belongs to this repository and the main work
is frontend-oriented (UI changes, calendar/details behavior, API
integration, refactors, frontend QA/smoke).

Do not use this skill when the task is backend-only, generic and not tied
to `maintmode-ui`, or when the user explicitly asks to implement immediately
without a separate tasking step.

## Required Sources Of Truth

Always inspect:

- `AGENTS.md`

Inspect only the sources that are relevant to the current task:

- `.agents/project-details/ui-specific/ui_rules.md` — UI structure, visual
  states;
- `.agents/project-details/ui-specific/ux_heuristics.md` — usability,
  hierarchy, operator flow;
- `.agents/project-details/ui-specific/calendar_month_packing.md` — month
  view;
- `https://github.com/ruko1202/maintmode/blob/main/docs/swagger.yaml` — API
  integration / backend contracts;
- current frontend code in `src/**`;
- current route handlers in `src/app/api/**` for data flow / integration;
- current task files in `.agents/tasks/<backlog|todo>/` when the task
  depends on earlier FE work.

Do not ask the user for information that can be derived from these sources.

## Source Classification Rules

`Source of Truth` must contain only canonical frontend inputs:

- project rules from `AGENTS.md`;
- approved UI/UX rules and month packing contract;
- approved backend contracts;
- current source code that defines live behavior.

Every `Source of Truth` entry must also appear in
`Discovery Summary -> What Was Checked`. Do not list a canonical source if
it was not actually inspected for the current task.

`References / Previous Inputs` contains non-canonical but useful inputs:
previous task files, old reports, prior prompts, historical issues,
superseded drafts.

`Verification Inputs` contains non-canonical verification artifacts:
component tests, smoke specs, fixtures, configs, report templates, helper
scripts. Do not place tests or smoke specs into `Source of Truth` by
default.

## Conventions

Use these conventions in every new task file:

- Linear-backed task id: Linear issue key (e.g. `RUK-123`)
- local task id: `fe-XX`
- task storage: Linear by default
- local task file: `.agents/tasks/<backlog|todo>/<task-id>/<task-id>.md`
- git branch: `feature/<task-id>-<short-kebab-slug>` (lowercase task id)
- commit convention: `<type>(<task-id>): <summary>`
- allowed commit types: `feat|fix|refactor|test|docs|chore|perf`
- max commits per task: `5`

## Role Selection

Select exactly one `Primary Role`. Default mapping:

- UI component, page, interaction, layout, or rendering changes →
  `frontend developer`
- frontend decomposition, integration strategy, complex calendar behavior,
  or architecture planning baked into the implementation → `frontend
  developer` (no separate architect role exists in this project)
- unclear requirements, scope shaping, or source-of-truth conflict
  resolution → `analyst`
- validation-heavy or acceptance-heavy work → `qa engineer`

Add `Supporting Roles` only if the task cannot be executed coherently by a
single primary role. Do not assign multiple primary owners.

## Frontend-Specific Constraints

Always encode the relevant frontend constraints into the task. Apply when
they match:

- do not connect the browser UI directly to backend APIs;
- route backend integration through `src/app/api/**`;
- keep backend ↔ frontend status mapping centralized, especially
  `canceled` ↔ `cancelled`;
- keep dates in ISO 8601 across transport and storage; parse to `Date`
  only at rendering boundaries;
- do not mix backend DTOs directly into UI components;
- do not keep production behavior on `mock-data` for real integration tasks;
- do not mass-refactor unrelated UI while integration is unstable;
- implement changes in small increments.

If the task touches month view: include `calendar_month_packing.md` in
`Source of Truth`, add month-packing constraints explicitly, and include
verification for `spanning` priority, visible row limits, and `+N more`.

## Frontend-Specific Blocks

Include these universal blocks in every task:

- `Decision Points`
- `References / Previous Inputs`
- `Task-Specific Contracts`
- `Validation Gaps`

Include these frontend-specific blocks explicitly when relevant:

- `Routing Contract` — navigation, deep links, restore logic, query params,
  router state;
- `Interaction Contract` — CTA behavior, hidden/disabled states, action
  hierarchy, user flow transitions;
- `Data Contract` — field mapping, DTO normalization, status mapping, time
  normalization, data-shape constraints;
- `Designer Contract` — approved visual specs, layout contracts, block
  ordering.

If a frontend-specific block is not relevant, write `None`. Use
`Task-Specific Contracts` for any additional exact sub-contracts that do
not fit the named blocks above.

## Discovery Rules

Before writing the task:

- inspect the minimum set of files needed to ground the request;
- record exactly what was checked;
- record what each source confirmed;
- separate confirmed facts from assumptions;
- surface inconsistencies between code, docs, and contracts.

Prefer checking these areas when relevant: `src/app/page.tsx`,
`src/app/api/**`, `src/features/**`, `src/server/backend/**`,
`src/domain/**`, `src/shared/**`, relevant tests in `tests/**`.

Do not scan the entire repository if a smaller relevant subset is enough.

## READY / BLOCKED Rules

Mark the task as `READY` only when all of the following are true:

- the frontend outcome is clear enough to execute;
- `Scope In` and `Scope Out` are concrete at file, module, or route level;
- the chosen primary role fits the task;
- the frontend constraints are explicit;
- the acceptance criteria are testable;
- the verification matrix includes concrete checks.

Mark the task as `BLOCKED` if any of:

- required frontend or contract information is missing;
- two or more realistic implementation directions exist without a confirmed
  choice;
- the task depends on an unavailable backend contract, design input, or
  product decision;
- safe execution would require guessing.

For `BLOCKED` tasks: keep the draft, fill `Open Questions` with one
question per blocking point including options, trade-offs, and a
recommended direction; do not present the task as execution-ready.

## Required Task Sections

Every generated task must use the structure from `references/task-template.md`
and include:

- task title;
- status (`READY` / `BLOCKED`);
- task id and storage location (Linear key or local path);
- task path status;
- task type;
- priority;
- primary role and supporting roles;
- task description;
- business goal;
- project context;
- discovery summary;
- source of truth;
- references / previous inputs;
- verification inputs;
- decision points;
- scope in;
- scope out;
- constraints;
- frontend requirements grouped by category (Functional / UI / API /
  Non-Functional / Edge Cases);
- UI states;
- acceptance criteria;
- routing/interaction/data/designer contracts (or `None`);
- task-specific contracts;
- verification matrix;
- implementation plan;
- git plan;
- deliverables (paths under the task root);
- dependencies;
- blockers;
- risks;
- assumptions;
- validation gaps;
- open questions;
- recommended approach.

Do not leave required sections blank. If a section is not applicable,
write `None`.

## Structured Entry Rules

Each frontend requirement entry: `id`, `requirement`, `rationale`,
`verification`.

Each edge-case entry: `id`, `case`, `expected_handling`, `verification`.

Each acceptance criteria entry: `id`, `text`, `evidence`.

Each decision point entry: `topic`, `options`, `chosen`, `rationale`.

Each task-specific contract entry: `name`, `rules`, `verification`.

## Verification Matrix Rules

`Verification Matrix` is the canonical verification block. For tasks that
include frontend code changes, include:

- `Automated Checks` (exact commands)
- `Manual Matrix` (exact scenarios / observations)
- `Acceptance Test Cases`
- `Testing Gaps`

If the task affects integration or route handlers, the matrix must
explicitly cover the affected flow (calendar loading, filters, details
opening, save behavior, status transitions, error handling). If the task
affects month view, the matrix must explicitly cover the month-packing
contract.

If `Scope In` includes tests, smoke specs, route handlers, or validation
artifacts, the matrix must include either an exact test command or a
`Testing Gap` entry explaining why that command cannot be provided yet.

Do not use vague checks such as "run tests", "check UI", "verify
manually". Name the exact command, scenario, or expected observation.

Use `Testing Gaps` only for verification limitations tied to: missing test
environment, absent executable command, unavailable browser/server/fixture,
test instability that prevents a reliable run.

Use `Validation Gaps` for broader residual uncertainty after the
verification matrix (production-only behavior, missing observability,
unavailable upstream behavior, scenarios intentionally outside scope). If
all known limitations are already in `Testing Gaps`, set `Validation Gaps`
to `None`.

## Deliverables / Artifact Paths

All report paths, artifact paths, and deliverables must use one planned
task root:

- local: `.agents/tasks/<backlog|todo>/<task-id>/`
- Linear-backed: `.agents/tasks/<backlog|todo>/<linear-issue-key>/`

Expected deliverables under the task root, when applicable:

- `reports/implementation_report.md` (always for implementation tasks)
- `reports/aqa_report.md` (when AQA is run)
- `reports/smoke_test_report.md` (when smoke is run)
- `reports/ui_inspector_report.md` (when UI inspection is run)
- `reports/ux_report.md` (when UX review is run)
- `artifacts/screenshots/**`
- `artifacts/<type>/**`

Do not point final deliverables to shared directories such as `/tmp` or
the project-root `screenshots/`. Do not mix `backlog` and `todo` roots
inside one task pack.

For local tasks, if the requested path does not match one of the canonical
roots, treat the request as non-canonical, do not silently normalize it,
and raise the mismatch to the user before finalizing the task pack.

## Task Path Status Rules

Use `Task Path Status` as an explicit metadata field for storage validity.
Allowed values: `linear`, `canonical`, `override-approved`.

- `linear` — task created in Linear; `Task ID` and `Task File` are the
  Linear key; omit `Override Reason`.
- `canonical` — `Task File` matches `.agents/tasks/<backlog|todo>/<task-id>/<task-id>.md`;
  omit `Override Reason`.
- `override-approved` — user explicitly requested a non-canonical path;
  task pack keeps all reports/artifacts under that overridden root;
  include `Override Reason` immediately under `Task Path Status`.

Do not use `override-approved` for silent drift or accidental path changes.

## Quality Checklist

Before finalizing the task, verify that:

- the title and body use technical English (literals preserved);
- the task file does not mix Russian and English prose;
- the task id matches the storage convention (Linear key or `fe-XX`);
- Linear is used by default unless local was explicitly requested;
- `Task Path Status` matches the real path; `Override Reason` is present
  only for `override-approved`;
- the primary role is correct;
- every `Source of Truth` entry also appears in `What Was Checked`;
- `Source of Truth` contains only canonical sources;
- `References / Previous Inputs` contains non-canonical historical inputs;
- `Verification Inputs` contains tests, smoke specs, and other
  non-canonical verification artifacts;
- `Scope In` and `Scope Out` do not overlap;
- frontend constraints are explicit and relevant;
- every requirement and acceptance criteria entry is structured and
  traceable;
- decision points are explicit when the task implies a chosen direction;
- routing/interaction/data/designer contracts are present when relevant;
- the verification matrix includes exact commands, manual scenarios,
  acceptance cases, and testing gaps;
- `Testing Gaps` and `Validation Gaps` do not duplicate each other without
  explicit broader impact;
- artifact paths point to the task folder;
- `Open Questions` are present for `BLOCKED` tasks and absent or `None`
  for `READY` tasks;
- month-view tasks explicitly reference the month-packing contract.

Reject the draft internally and rewrite it if any checklist item fails.

## Resource

Use `references/task-template.md` as the canonical Markdown template.
