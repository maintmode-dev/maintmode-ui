---
name: fe-ui-inspector-workflow
description: This skill should be used when the agent needs to perform a formal UI inspection of maintmode-ui against the project's UI rules, record only factual compliance or violations, and produce a PASS or FAIL ui inspector report without re-owning UX review or gate decisions.
---

# FE UI Inspector Workflow

## Purpose

Perform a formal UI inspection for `maintmode-ui` against the project's UI rules.

Use this skill after implementation and technical validation are complete enough to support a UI-specific review.

This skill does not replace AQA, UX review, or gate.

Treat these skills as the owners of adjacent responsibilities:
- [`.agents/skills/fe-aqa-workflow/SKILL.md`](../fe-aqa-workflow/SKILL.md) for technical validation and `aqa_report.md`;
- `fe-ux-reviewer-workflow` for UX risk review;
- `fe-gate-workflow` for the final binary decision.

Own only the formal UI-inspection delta:
- validate the changed UI surface against `.agents/project-details/ui-specific/ui_rules.md`;
- record only observed compliance, violations, and evidence;
- keep the report factual and non-prescriptive;
- produce `ui_inspector_report.md` with a clear `PASS` or `FAIL`.

## When To Use

Use this skill when:
- the task file already exists under `.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md`;
- the implementation and AQA reports exist for the same task root;
- the workflow is at the formal UI review stage before gate.

Do not use this skill when:
- implementation is incomplete;
- no `implementation_report.md` exists for the task;
- no `aqa_report.md` exists for the task;
- the requested work is UX-only, AQA-only, or gate-only.

## Required Inputs

Load these inputs first:
- the task file from `.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md`;
- `.agents/tasks/<backlog|todo>/fe-XX/reports/implementation_report.md`;
- `.agents/tasks/<backlog|todo>/fe-XX/reports/aqa_report.md`;
- the task root derived from `Task File`;
- `.agents/project-details/ui-specific/ui_rules.md`.

Load these additional inputs only when relevant:
- `.agents/project-details/ui-specific/calendar_month_packing.md` for month-view tasks;
- screenshots, traces, and other evidence already stored inside the task folder;
- the current UI code for the changed components;
- browser-based evidence flows if the changed surface cannot be reviewed from static artifacts alone.

Inspect only the inputs needed to determine formal UI compliance reliably.

## Preconditions

Before reviewing, verify all of the following:
- `Task File` uses a canonical `.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md` path;
- `implementation_report.md` exists under the same task root;
- `aqa_report.md` exists under the same task root;
- the changed UI surface, or explicit absence of UI changes, can be determined from the implementation artifacts.

If a precondition fails, do not invent UI findings. Record the missing context and fail the report if the missing context prevents reliable UI inspection.

## Scope Ownership

Do not silently take ownership of coding, AQA, UX review, or gate decisions.

Do not silently change:
- product code;
- task requirements;
- acceptance criteria;
- UX heuristics;
- final gate verdict.

If a UI problem is found:
- record the violated UI rule;
- describe the observable behavior;
- attach or reference evidence when available;
- set the report to `FAIL` when the violation blocks formal compliance.

## Allowed Actions

Allowed:
- inspect the implemented UI surface against `.agents/project-details/ui-specific/ui_rules.md`;
- capture or reference screenshots and other UI evidence inside the task folder;
- mark rules as compliant, violated, or not applicable when the task changed no relevant UI surface;
- note when a non-UI task has no applicable UI changes and therefore produces no UI-rule violations.

Forbidden:
- propose redesigns or subjective improvements;
- write UX recommendations in place of UI findings;
- rewrite product code;
- claim visual compliance that was not actually inspected;
- make the final gate decision.

## Workflow

1. Open the task file, implementation report, and AQA report.
2. Read only the sections needed for formal UI inspection:
   - scope
   - constraints
   - acceptance criteria
   - changed files
   - implementation notes
   - AQA handoff notes
3. Determine whether the task changed a UI surface that is covered by `.agents/project-details/ui-specific/ui_rules.md`.
4. If UI changed, inspect the relevant rules and changed surfaces only.
5. If the task did not change UI meaningfully, record that the UI rule set is not materially engaged and explain why the report still passes.
6. For month-view tasks, inspect `.agents/project-details/ui-specific/calendar_month_packing.md` alongside RULE-11.
7. Save the result to `.agents/tasks/<backlog|todo>/fe-XX/reports/ui_inspector_report.md` using `references/ui-inspector-report-template.md`.

## Rule Evaluation Rules

Use `.agents/project-details/ui-specific/ui_rules.md` as the only formal UI rule source.

When evaluating a rule:
- record only observable facts;
- do not infer compliance from intent;
- do not convert uncertainty into a pass.

Apply these status rules:
- use `PASS` when the inspected UI surface clearly complies;
- use `FAIL` when the inspected UI surface clearly violates the rule;
- use `NOT_APPLICABLE` only when the task did not change any UI surface relevant to that rule.

If a changed UI surface is relevant to a rule but cannot be confidently verified:
- treat that rule as `FAIL` in line with RULE-10.

## Project-Specific UI Rules

Apply these rules when they match the task:
- inspect only against `.agents/project-details/ui-specific/ui_rules.md`, not UX heuristics;
- keep evidence inside `.agents/tasks/<backlog|todo>/fe-XX/artifacts/...`;
- do not reference shared or temporary screenshot paths as final evidence links.

If the task affects month view:
- validate RULE-11 together with `.agents/project-details/ui-specific/calendar_month_packing.md`;
- make the month-packing result explicit in the report.

## Status Rules

Set the UI inspector report to `PASS` only when:
- every relevant inspected rule passes; and
- no material UI-rule violation is observed.

Set the UI inspector report to `FAIL` when any of the following is true:
- a relevant inspected rule fails;
- a changed UI surface cannot be confidently validated against a relevant rule;
- the evidence is too incomplete to support reliable formal UI inspection.

For tasks with no material UI changes:
- the report may still be `PASS`;
- explain why the UI rule set is not materially affected;
- do not invent violations or fake per-rule coverage beyond what is relevant.

## Output Artifact

Save exactly one UI inspection artifact from this skill:
- `.agents/tasks/<backlog|todo>/fe-XX/reports/ui_inspector_report.md`

Use the same task root as `Task File`.

Do not mix `backlog` and `todo` in one report.

## Required Sections Of `ui_inspector_report.md`

The UI inspector report must include:
- report status;
- task reference;
- inspection scope;
- UI change assessment;
- rule checklist;
- violations;
- evidence;
- notes for gate.

If a section is not relevant, write `None`.

## Handoff To Gate

The UI inspection handoff is ready only when it gives a concrete answer to all of the following:
- which UI surface was inspected;
- which UI rules were relevant;
- which rules passed;
- which rules failed;
- where the evidence lives;
- whether the report is a formal `PASS` or `FAIL`.

Do not hand off vague guidance such as:
- "UI looks fine";
- "no obvious visual issues";
- "probably acceptable";
- "needs UX review".

## Quality Checklist

Before finalizing the skill output, verify that:
- the report path uses the same task root as `Task File`;
- the report evaluates only `.agents/project-details/ui-specific/ui_rules.md`;
- the report contains facts, not redesign ideas;
- rule uncertainty on a changed surface does not become a pass;
- evidence paths stay inside the task folder;
- month-view tasks explicitly mention RULE-11 and month packing;
- non-UI tasks explain why UI rules were not materially engaged;
- the report does not take over UX or gate ownership.

## Resource

Use:
- `references/ui-inspector-report-template.md` - canonical template for `ui_inspector_report.md`.
