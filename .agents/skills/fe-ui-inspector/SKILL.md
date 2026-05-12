---
name: fe-ui-inspector
description: Use this skill to inspect a `maintmode-ui` change against `.agents/project-details/ui-specific/ui_rules.md`, record only factual compliance/violations, and produce a PASS/FAIL `ui_inspector_report.md`.
---

# FE UI Inspector

## Purpose

Inspect a `maintmode-ui` change against the project's UI rules and produce
an explicit `PASS` or `FAIL` report. Records only observable facts — no
redesign suggestions.

## When To Use

- a UI change has landed in `maintmode-ui`;
- `implementation_report.md` exists for the same task root;
- formal UI-rule compliance must be recorded before handing the PR to a
  human reviewer.

Do not use this skill when the requested work is UX-only, AQA-only, or
strictly non-UI.

## Required Inputs

- the task file from `.agents/tasks/<backlog|todo>/<task-id>/<task-id>.md`;
- `implementation_report.md`;
- `aqa_report.md` when available;
- `.agents/project-details/ui-specific/ui_rules.md`.

When relevant:

- `.agents/project-details/ui-specific/calendar_month_packing.md` for
  month-view tasks;
- screenshots/traces already stored inside the task folder;
- the current UI code for the changed components;
- a live browser session if static evidence is not enough.

## Allowed Actions

- inspect the implemented UI surface against `ui_rules.md`;
- capture or reference screenshots and other UI evidence inside the task
  folder;
- mark each rule as `PASS`, `FAIL`, or `NOT_APPLICABLE` (when the task
  changed no relevant UI surface);
- note when a non-UI task has no applicable UI changes and therefore
  produces no UI-rule violations.

## Forbidden Actions

- propose redesigns or subjective improvements;
- write UX recommendations in place of UI findings;
- rewrite product code;
- claim visual compliance that was not actually inspected;
- decide the final APPROVE/REJECT — that is the human reviewer's call.

## Rule Evaluation Rules

`.agents/project-details/ui-specific/ui_rules.md` is the only formal UI
rule source.

When evaluating a rule:

- record only observable facts;
- do not infer compliance from intent;
- do not convert uncertainty into a pass — RULE-10 says fail-first.

Status values:

- `PASS` — the inspected UI surface clearly complies;
- `FAIL` — the inspected UI surface clearly violates the rule, OR the
  changed surface cannot be confidently verified against a relevant rule;
- `NOT_APPLICABLE` — the task did not change any UI surface relevant to
  that rule.

## Project-Specific UI Rules

- inspect only against `ui_rules.md`, not UX heuristics;
- keep evidence inside `.agents/tasks/<backlog|todo>/<task-id>/artifacts/...`;
- do not reference shared or temporary screenshot paths as final evidence;
- if the task affects month view, validate RULE-11 together with
  `calendar_month_packing.md` and make the month-packing result explicit.

## Status Rules

Set the report to `PASS` when:

- every relevant inspected rule passes; and
- no material UI-rule violation is observed.

Set the report to `FAIL` when any relevant rule fails, the evidence is too
incomplete to support reliable inspection, or a changed surface cannot be
confidently validated.

For tasks with no material UI changes the report may still be `PASS` —
explain why UI rules are not materially engaged; do not invent per-rule
coverage beyond what is relevant.

## Output Artifact

Save exactly one report:

- `.agents/tasks/<backlog|todo>/<task-id>/reports/ui_inspector_report.md`

## Required Sections Of `ui_inspector_report.md`

- report status (`PASS` or `FAIL`);
- task reference;
- inspection scope;
- UI change assessment;
- rule checklist (each rule with status + evidence);
- violations;
- evidence (paths inside the task folder);
- notes for the human reviewer.

If a section is not relevant, write `None`.

## Resource

Use `references/ui-inspector-report-template.md` as the canonical template.
