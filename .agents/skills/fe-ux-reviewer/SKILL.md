---
name: fe-ux-reviewer
description: Use this skill to review a `maintmode-ui` change against `.agents/project-details/ui-specific/ux_heuristics.md`, focus on operator risk and decision-making quality, and produce a PASS/FAIL `ux_report.md`.
---

# FE UX Reviewer

## Purpose

Review the user experience of a `maintmode-ui` change against the project's
UX heuristics and produce an explicit `PASS` or `FAIL` report. Focus on
operator risk and decision-making quality, not visual rule compliance.

## When To Use

- a user-facing change has landed in `maintmode-ui`;
- `implementation_report.md` exists for the same task root;
- UX risk must be recorded before handing the PR to a human reviewer.

Do not use this skill when the requested work is UI-rule-only, AQA-only,
or strictly non-UX.

`ui_inspector_report.md` is not required as input — UI inspection and UX
review are independent.

## Required Inputs

- the task file from `.agents/tasks/<backlog|todo>/<task-id>/<task-id>.md`;
- `implementation_report.md`;
- `aqa_report.md` when available;
- `.agents/project-details/ui-specific/ux_heuristics.md`.

When relevant:

- `.agents/project-details/ui-specific/calendar_month_packing.md` for
  month-view tasks;
- screenshots/traces stored inside the task folder;
- the current user-facing code for the changed surface;
- a live browser session if static evidence is not enough.

## Allowed Actions

- inspect the changed experience against `ux_heuristics.md`;
- capture or reference screenshots and other UX evidence inside the task
  folder;
- record UX risks, usability friction, and heuristic compliance;
- note when a non-UX task has no material user-facing change.

## Forbidden Actions

- write code-level implementation advice;
- rewrite product code;
- replace UI-rule inspection with heuristic commentary;
- claim UX compliance that was not actually reviewed;
- decide the final APPROVE/REJECT — that is the human reviewer's call.

## Heuristic Evaluation Rules

`.agents/project-details/ui-specific/ux_heuristics.md` is the only formal
UX heuristic source.

When evaluating a heuristic:

- focus on operator-facing behavior and decision-making quality;
- record only observable UX risk or compliance;
- do not convert heuristic uncertainty into a pass;
- do not turn the report into a redesign brief.

Status values per heuristic:

- `PASS` — the reviewed experience clearly satisfies the heuristic;
- `FAIL` — the reviewed experience clearly creates material risk against
  the heuristic, OR a changed surface relevant to the heuristic cannot be
  confidently reviewed;
- `NOT_APPLICABLE` — the task did not change any surface relevant to that
  heuristic.

## Project-Specific UX Rules

- inspect only against `ux_heuristics.md`, not formal UI rules;
- focus on SRE-first operator workflows, especially risk readability,
  cognitive load, and information density;
- keep evidence inside `.agents/tasks/<backlog|todo>/<task-id>/artifacts/...`;
- do not reference shared or temporary screenshot paths as final evidence;
- if the task affects month view, check the UX impact of
  `calendar_month_packing.md` (spanning priority, bottom-anchored
  `+N more`, timed-event start-time readability) and make the result
  explicit.

## Status Rules

Set the report to `PASS` when:

- every relevant reviewed heuristic passes; and
- no material UX risk is observed.

Set the report to `FAIL` when any relevant heuristic fails, the evidence
is too incomplete to support reliable review, or a changed surface cannot
be confidently reviewed.

For tasks with no material UX changes the report may still be `PASS` —
explain why the heuristic set is not materially affected; do not invent
per-heuristic coverage beyond what is relevant.

## Output Artifact

Save exactly one report:

- `.agents/tasks/<backlog|todo>/<task-id>/reports/ux_report.md`

## Required Sections Of `ux_report.md`

- report status (`PASS` or `FAIL`);
- task reference;
- review scope;
- UX change assessment;
- heuristic checklist (each heuristic with status + evidence);
- issues;
- evidence (paths inside the task folder);
- notes for the human reviewer.

If a section is not relevant, write `None`.

## Resource

Use `references/ux-report-template.md` as the canonical template.
