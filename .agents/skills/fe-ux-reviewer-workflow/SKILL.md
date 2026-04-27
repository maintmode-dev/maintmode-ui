---
name: fe-ux-reviewer-workflow
description: This skill should be used when the agent needs to review maintmode-ui against the project's UX heuristics, assess operator-facing risk and usability impact, and produce a PASS or FAIL ux report without re-owning UI rule inspection or gate decisions.
---

# FE UX Reviewer Workflow

## Purpose

Review the user experience of `maintmode-ui` against the project's UX heuristics.

Use this skill after implementation and technical validation are complete enough to support a UX-specific review.

This skill does not replace AQA, UI inspection, or gate.

Treat these skills as the owners of adjacent responsibilities:
- [`.agents/skills/fe-aqa-workflow/SKILL.md`](../fe-aqa-workflow/SKILL.md) for technical validation and `aqa_report.md`;
- [`.agents/skills/fe-ui-inspector-workflow/SKILL.md`](../fe-ui-inspector-workflow/SKILL.md) for formal UI-rule validation;
- `fe-gate-workflow` for the final binary decision.

Own only the UX-review delta:
- evaluate the changed experience against `.agents/project-details/ui-specific/ux_heuristics.md`;
- focus on operator risk, decision-making speed, clarity, and cognitive load;
- record only UX findings, risks, and evidence;
- produce `ux_report.md` with a clear `PASS` or `FAIL`.

## When To Use

Use this skill when:
- the task file already exists under `.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md`;
- the implementation and AQA reports exist for the same task root;
- the workflow is at the UX review stage before gate.

Do not use this skill when:
- implementation is incomplete;
- no `implementation_report.md` exists for the task;
- no `aqa_report.md` exists for the task;
- the requested work is UI-rule-only, AQA-only, or gate-only.

## Required Inputs

Load these inputs first:
- the task file from `.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md`;
- `.agents/tasks/<backlog|todo>/fe-XX/reports/implementation_report.md`;
- `.agents/tasks/<backlog|todo>/fe-XX/reports/aqa_report.md`;
- the task root derived from `Task File`;
- `.agents/project-details/ui-specific/ux_heuristics.md`.

Load these additional inputs only when relevant:
- `.agents/project-details/ui-specific/calendar_month_packing.md` for month-view tasks;
- screenshots, traces, and other evidence already stored inside the task folder;
- the current user-facing code for the changed surface;
- browser-based evidence flows if the changed experience cannot be reviewed from static artifacts alone.

Do not require `ui_inspector_report.md` as an input. UI inspection and UX review are parallel review stages.

Inspect only the inputs needed to determine UX risk and heuristic compliance reliably.

## Preconditions

Before reviewing, verify all of the following:
- `Task File` uses a canonical `.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md` path;
- `implementation_report.md` exists under the same task root;
- `aqa_report.md` exists under the same task root;
- the changed user-facing surface, or explicit absence of UX-impacting changes, can be determined from the implementation artifacts.

If a precondition fails, do not invent UX findings. Record the missing context and fail the report if the missing context prevents reliable UX review.

## Scope Ownership

Do not silently take ownership of coding, UI-rule inspection, AQA, or gate decisions.

Do not silently change:
- product code;
- task requirements;
- acceptance criteria;
- formal UI-rule findings;
- final gate verdict.

If a UX problem is found:
- map it to the relevant heuristic;
- describe the observed risk and user impact;
- attach or reference evidence when available;
- set the report to `FAIL` when the risk materially degrades the intended operator workflow.

## Allowed Actions

Allowed:
- inspect the changed experience against `.agents/project-details/ui-specific/ux_heuristics.md`;
- capture or reference screenshots and other UX evidence inside the task folder;
- record UX risks, usability friction, and heuristic compliance;
- note when a non-UX task has no material user-facing change and therefore produces no heuristic failures.

Forbidden:
- write code-level implementation advice;
- rewrite product code;
- replace UI-rule inspection with heuristic commentary;
- claim UX compliance that was not actually reviewed;
- make the final gate decision.

## Workflow

1. Open the task file, implementation report, and AQA report.
2. Read only the sections needed for UX review:
   - scope
   - constraints
   - acceptance criteria
   - changed files
   - implementation notes
   - AQA handoff notes
3. Determine whether the task changed a user-facing surface that is covered by `.agents/project-details/ui-specific/ux_heuristics.md`.
4. If UX changed, inspect the relevant heuristics and changed surfaces only.
5. If the task did not change UX materially, record that the heuristic set is not materially engaged and explain why the report still passes.
6. For month-view tasks, inspect `.agents/project-details/ui-specific/calendar_month_packing.md` alongside the relevant heuristics.
7. Save the result to `.agents/tasks/<backlog|todo>/fe-XX/reports/ux_report.md` using `references/ux-report-template.md`.

## Heuristic Evaluation Rules

Use `.agents/project-details/ui-specific/ux_heuristics.md` as the only formal UX heuristic source.

When evaluating a heuristic:
- focus on operator-facing behavior and decision-making quality;
- record only observable UX risk or compliance;
- do not convert heuristic uncertainty into a pass;
- do not turn the report into a redesign brief.

Apply these status rules per heuristic:
- use `PASS` when the reviewed experience clearly satisfies the heuristic;
- use `FAIL` when the reviewed experience clearly creates material risk against the heuristic;
- use `NOT_APPLICABLE` only when the task did not change any surface relevant to that heuristic.

If a changed user-facing surface is relevant to a heuristic but cannot be confidently reviewed:
- treat that heuristic as `FAIL`.

## Project-Specific UX Rules

Apply these rules when they match the task:
- inspect only against `.agents/project-details/ui-specific/ux_heuristics.md`, not formal UI rules;
- focus on SRE-first operator workflows, especially risk readability, cognitive load, and information density;
- keep evidence inside `.agents/tasks/<backlog|todo>/fe-XX/artifacts/...`;
- do not reference shared or temporary screenshot paths as final evidence links.

If the task affects month view:
- check the UX impact of `.agents/project-details/ui-specific/calendar_month_packing.md`, especially spanning priority, bottom-anchored `+N more`, and timed-event start-time readability;
- make the month-packing UX result explicit in the report.

## Status Rules

Set the UX report to `PASS` only when:
- every relevant reviewed heuristic passes; and
- no material UX risk is observed for the changed experience.

Set the UX report to `FAIL` when any of the following is true:
- a relevant reviewed heuristic fails;
- a changed user-facing surface cannot be confidently reviewed against a relevant heuristic;
- the evidence is too incomplete to support reliable UX review.

For tasks with no material UX changes:
- the report may still be `PASS`;
- explain why the heuristic set is not materially affected;
- do not invent risks or fake per-heuristic coverage beyond what is relevant.

## Output Artifact

Save exactly one UX review artifact from this skill:
- `.agents/tasks/<backlog|todo>/fe-XX/reports/ux_report.md`

Use the same task root as `Task File`.

Do not mix `backlog` and `todo` in one report.

## Required Sections Of `ux_report.md`

The UX report must include:
- report status;
- task reference;
- review scope;
- UX change assessment;
- heuristic checklist;
- issues;
- evidence;
- notes for gate.

If a section is not relevant, write `None`.

## Handoff To Gate

The UX review handoff is ready only when it gives a concrete answer to all of the following:
- which user-facing surface was reviewed;
- which heuristics were relevant;
- which heuristics passed;
- which heuristics failed;
- where the evidence lives;
- whether the report is a formal `PASS` or `FAIL`.

Do not hand off vague guidance such as:
- "UX looks fine";
- "seems usable";
- "probably acceptable";
- "check with UI inspector".

## Quality Checklist

Before finalizing the skill output, verify that:
- the report path uses the same task root as `Task File`;
- the report evaluates only `.agents/project-details/ui-specific/ux_heuristics.md`;
- the report contains UX findings and risks, not code-level implementation advice;
- heuristic uncertainty on a changed surface does not become a pass;
- evidence paths stay inside the task folder;
- month-view tasks explicitly mention month-packing UX impact;
- non-UX tasks explain why the heuristics were not materially engaged;
- the report does not take over UI inspection or gate ownership.

## Resource

Use:
- `references/ux-report-template.md` - canonical template for `ux_report.md`.
