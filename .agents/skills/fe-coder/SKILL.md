---
name: fe-coder
description: Use this skill to implement frontend changes for `maintmode-ui` against an existing task pack — apply scoped code changes, run local checks, record what changed and what was verified.
---

# FE Coder

## Purpose

Implement frontend changes for `maintmode-ui` defined by a task pack under
`.agents/tasks/<backlog|todo>/<task-id>/<task-id>.md`.

When the change is large enough to need an explicit plan, draft it inline at
the top of `implementation_report.md` before writing code.

## When To Use

- the task file already exists and is `READY`;
- product code in `maintmode-ui` must change inside the task scope;
- the work is not pure review, QA-only, or backend-only.

## Required Inputs

- the task file from `.agents/tasks/<backlog|todo>/<task-id>/<task-id>.md`;
- the current code for the files and modules in scope;
- task-referenced canonical contracts only when relevant: `AGENTS.md`, UI
  rules, UX heuristics, calendar month packing, backend swagger.

Inspect only the code and contracts needed to execute the change safely.

## Allowed Actions

- edit product code inside the approved scope;
- add or update tests when tests are in scope or directly required to protect
  the changed behavior;
- update local adapters, mappers, UI components, route handlers, and
  utilities inside task boundaries;
- run local commands needed to validate the change.

## Forbidden Actions

- expand the task into unrelated refactors;
- bypass route-handler boundaries and connect the browser UI directly to
  backend APIs;
- move backend DTO concerns into UI components;
- disable or weaken checks just to get a green result.

## Project-Specific Implementation Rules

Apply these rules when they match the task:

- keep backend access behind `src/app/api/**`;
- keep backend ↔ frontend status mapping centralized, especially
  `canceled` ↔ `cancelled`;
- keep transport dates in ISO 8601; do not spread `Date` parsing into shared
  transport layers;
- keep backend DTO details out of UI components;
- prefer small incremental changes over broad refactors;
- preserve adapter and normalization boundaries.

If the task affects month view:

- preserve `.agents/project-details/ui-specific/calendar_month_packing.md`;
- keep `spanning` above `timed-single-day`;
- keep `+N more` at the bottom of the day cell.

## Local Validation

Before finalizing, run the minimum relevant checks for the changed scope:

- `npm run lint`
- `npm run test:contracts`
- `npm run test`
- `npm run build` (when the change can affect the build)
- targeted browser smoke when the change is user-visible

Do not claim repository-wide validation if only targeted checks were run.

If a useful check cannot run, document the exact limitation in the
implementation report.

## When To Stop

Treat the work as blocked if any of the following is true:

- required environment, dependency, fixture, or contract data is missing;
- the change would require guessing outside the approved task scope;
- a critical local check fails and the failure cannot be resolved within
  scope.

When blocked: save the implementation report anyway, document what was
changed, what was attempted, and what prevents completion.

## Output Artifact

Save exactly one implementation report:

- `.agents/tasks/<backlog|todo>/<task-id>/reports/implementation_report.md`

## Required Sections Of `implementation_report.md`

- report status;
- task reference;
- summary;
- changed files;
- implementation notes by area;
- contract-preservation notes;
- local checks run;
- unresolved issues or limits;
- git status summary;
- handoff notes for the reviewer.

If a section is not relevant, write `None`.

## Resource

Use `references/implementation-report-template.md` as the canonical template
for `implementation_report.md`.
