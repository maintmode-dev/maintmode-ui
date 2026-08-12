---
name: fe-aqa
description: Use this skill to validate the technical quality of a `maintmode-ui` change — run lint/test/contracts/build (and targeted smoke when relevant), then write a PASS/FAIL `aqa_report.md`.
---

# FE AQA

## Purpose

Validate the technical quality of a completed frontend change for
`maintmode-ui` and produce an explicit `PASS` or `FAIL` report.

## When To Use

- a `maintmode-ui` change has been implemented;
- `implementation_report.md` exists for the same task root;
- technical validation must be recorded before UI/UX review and before
  handing the PR to a human reviewer.

## Required Inputs

- the task file from `.agents/tasks/<backlog|todo>/<task-id>/<task-id>.md`;
- `.agents/tasks/<backlog|todo>/<task-id>/reports/implementation_report.md`;
- the changed code.

Inspect only what is needed to decide the technical status reliably.

## Allowed Actions

- run automated checks: `npm run lint`, `npm run test:boundaries`,
  `npm run test:contracts`, `npm run test`, `npm run build`;
- run targeted manual checks when the task requires them;
- collect logs, screenshots, and other evidence inside the task folder
  (`artifacts/...`);
- summarize technical findings and testing gaps in `aqa_report.md`.

## Forbidden Actions

- rewrite the implementation silently to make tests pass;
- claim checks passed when they were not run;
- hide environment blockers behind generic wording;
- make UI or UX review findings in place of technical validation;
- decide the final APPROVE/REJECT — that is the human reviewer's call.

## Status Rules

Set the AQA report to `PASS` when:

- all required executed checks pass; and
- any remaining testing gaps are explicitly documented and do not
  invalidate technical confidence for this task.

Set the AQA report to `FAIL` when any of:

- a required automated or manual check fails;
- a required check cannot run and no acceptable substitute exists;
- the implementation report or the current code reveals a technical
  regression that blocks required verification;
- the validation evidence is too incomplete to support a reliable PASS.

If tests do not exist for a behavior, record the absence as a testing gap.
Do not auto-fail unless the task explicitly required that coverage or the
missing coverage prevents a reliable decision.

## Project-Specific Validation Rules

- prefer the exact commands named in the task file when they are still
  valid; record any adjustment with reason;
- keep all evidence under
  `.agents/tasks/<backlog|todo>/<task-id>/artifacts/...`;
- do not use shared or temporary paths as final evidence links;
- if the task affects month view, include an explicit check against
  `.agents/project-details/ui-specific/calendar_month_packing.md` and
  record whether it was validated automatically, manually, or both.

## Output Artifact

Save exactly one report:

- `.agents/tasks/<backlog|todo>/<task-id>/reports/aqa_report.md`

## Required Sections Of `aqa_report.md`

- report status (`PASS` or `FAIL`);
- task reference;
- automated checks (command, result);
- manual technical checks;
- findings or bugs;
- testing gaps;
- evidence (paths inside the task folder);
- handoff notes for the reviewer.

If a section is not relevant, write `None`.

## Resource

Use `references/aqa-report-template.md` as the canonical template for
`aqa_report.md`.
