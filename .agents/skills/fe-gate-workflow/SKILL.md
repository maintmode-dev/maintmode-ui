---
name: fe-gate-workflow
description: This skill should be used when the agent needs to make the final APPROVE or REJECT decision for a maintmode-ui task by validating the required stage artifacts, explicit report statuses, evidence paths, and git discipline without re-owning implementation or review stages.
---

# FE Gate Workflow

## Purpose

Make the final binary release decision for a completed frontend workflow in `maintmode-ui`.

Use this skill only after all required upstream stage artifacts exist.

This skill does not replace architecture, implementation, AQA, UI inspection, or UX review.

Treat these skills as the owners of upstream stage artifacts:
- [`.agents/skills/fe-architect-workflow/SKILL.md`](../fe-architect-workflow/SKILL.md) for `architecture_plan.md`;
- [`.agents/skills/fe-coder-workflow/SKILL.md`](../fe-coder-workflow/SKILL.md) for `implementation_report.md`;
- [`.agents/skills/fe-aqa-workflow/SKILL.md`](../fe-aqa-workflow/SKILL.md) for `aqa_report.md`;
- [`.agents/skills/fe-ui-inspector-workflow/SKILL.md`](../fe-ui-inspector-workflow/SKILL.md) for `ui_inspector_report.md`;
- [`.agents/skills/fe-ux-reviewer-workflow/SKILL.md`](../fe-ux-reviewer-workflow/SKILL.md) for `ux_report.md`.

Own only the final gate delta:
- verify that all mandatory stage artifacts exist under the same task root;
- verify that the required report statuses are explicit and acceptable;
- verify evidence-path discipline and git discipline;
- emit exactly one binary decision: `APPROVE` or `REJECT`.

## When To Use

Use this skill when:
- the task file already exists under `.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md`;
- all required upstream stage reports are expected to be complete;
- the workflow is at the final gate stage.

Do not use this skill when:
- any required upstream stage report is still missing;
- implementation, AQA, UI inspection, or UX review is still in progress;
- the request is to improve the code or reports rather than to issue the final decision.

## Required Inputs

Load these inputs first:
- the task file from `.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md`;
- `.agents/tasks/<backlog|todo>/fe-XX/reports/architecture_plan.md`;
- `.agents/tasks/<backlog|todo>/fe-XX/reports/implementation_report.md`;
- `.agents/tasks/<backlog|todo>/fe-XX/reports/aqa_report.md`;
- `.agents/tasks/<backlog|todo>/fe-XX/reports/ui_inspector_report.md`;
- `.agents/tasks/<backlog|todo>/fe-XX/reports/ux_report.md`;
- the task root derived from `Task File`.

Load these additional inputs only when relevant:
- `.agents/project-details/ui-specific/calendar_month_packing.md` for month-view tasks;
- evidence files referenced by AQA, UI, and UX reports when path validation needs confirmation.

Inspect only the artifacts required to make the final gate decision reliably.

## Preconditions

Before deciding, verify all of the following:
- `Task File` uses a canonical `.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md` path;
- every required stage report exists under the same task root;
- the required report statuses are readable from the artifacts.

If a precondition fails:
- do not continue toward `APPROVE`;
- issue `REJECT`;
- state the exact missing artifact or unreadable status.

## Scope Ownership

Do not silently take ownership of upstream implementation or review work.

Do not silently change:
- product code;
- architecture decisions;
- implementation reports;
- AQA, UI, or UX findings;
- task requirements;
- task acceptance criteria.

If the gate result is negative:
- issue `REJECT`;
- explain the blocking precheck or report condition;
- point the task back to the upstream stage that must address it.

## Allowed Actions

Allowed:
- verify artifact existence;
- verify report status readability;
- verify same-root path discipline across reports and evidence;
- verify git discipline using `implementation_report.md`;
- verify month-view contract coverage when the task requires it;
- issue `APPROVE` or `REJECT` in `gate_result.md`.

Forbidden:
- rewrite upstream reports to manufacture a pass;
- downgrade a real failure into a pass;
- issue a non-binary decision;
- treat optional legacy artifacts such as `review.md` as mandatory.

## Workflow

1. Open the task file and derive the canonical task root.
2. Verify that all required stage reports exist under that same root.
3. Read the explicit statuses from:
   - `architecture_plan.md`
   - `implementation_report.md`
   - `aqa_report.md`
   - `ui_inspector_report.md`
   - `ux_report.md`
4. Verify git discipline from `implementation_report.md`:
   - branch is not `main` or `master`;
   - branch matches `feature/fe-XX-...`;
   - commit count is `<= 5`.
5. Verify that referenced evidence paths stay inside `.agents/tasks/<backlog|todo>/fe-XX/artifacts/...`.
6. If the task affects month view, verify that the month-packing contract is explicitly covered by the relevant reports.
7. Save the final result to `.agents/tasks/<backlog|todo>/fe-XX/reports/gate_result.md` using `references/gate-result-template.md`.

## Decision Rules

Issue `APPROVE` only when all of the following are true:
- `architecture_plan.md` exists and is not blocked;
- `implementation_report.md` exists and is not blocked;
- `aqa_report.md` has explicit status `PASS`;
- `ui_inspector_report.md` has explicit status `PASS`;
- `ux_report.md` has explicit status `PASS`;
- git discipline is valid;
- evidence-path discipline is valid;
- no month-view contract violation blocks approval for month-view tasks.

Issue `REJECT` when any of the following is true:
- a required report is missing;
- a required status cannot be read;
- `architecture_plan.md` is blocked;
- `implementation_report.md` is blocked;
- `aqa_report.md`, `ui_inspector_report.md`, or `ux_report.md` is `FAIL`;
- git discipline is invalid;
- evidence paths point outside the task root;
- the task affects month view and the required month-packing validation is missing or failed.

Do not issue any other decision value.

## Status Interpretation Rules

Interpret upstream artifacts conservatively.

Use these expectations:
- `architecture_plan.md` must indicate a usable plan status such as `READY`, not `BLOCKED`;
- `implementation_report.md` must indicate an implementation status such as `DONE`, not `BLOCKED`;
- `aqa_report.md` must expose overall `PASS` or `FAIL`;
- `ui_inspector_report.md` must expose overall `PASS` or `FAIL`;
- `ux_report.md` must expose overall `PASS` or `FAIL`.

If the artifact uses a legacy wording but the overall status is still explicit and unambiguous, the gate may interpret it.

If the wording is ambiguous:
- treat it as unreadable;
- issue `REJECT`.

## Project-Specific Gate Rules

Apply these rules when they match the task:
- use `.agents/tasks/<backlog|todo>/fe-XX/...` as the only valid task root;
- do not require optional `review.md` or legacy `.agent/tasks/...` paths;
- keep final evidence paths inside `.agents/tasks/<backlog|todo>/fe-XX/artifacts/...`;
- do not allow `APPROVE` when the branch format violates `feature/fe-XX-<short-kebab-slug>`.

If the task affects month view:
- require explicit month-packing coverage in the relevant reports;
- reject the task if the month-packing contract is failed or not verifiably reviewed.

## Output Artifact

Save exactly one gate artifact:
- `.agents/tasks/<backlog|todo>/fe-XX/reports/gate_result.md`

Use the same task root as `Task File`.

Do not mix `backlog` and `todo` in one report.

## Required Sections Of `gate_result.md`

The gate result must include:
- decision;
- task reference;
- precheck summary;
- mandatory report table;
- git discipline summary;
- evidence-path validation summary;
- month-view contract summary;
- rationale;
- next action.

If a section is not relevant, write `None`.

## Quality Checklist

Before finalizing the skill output, verify that:
- the decision is exactly `APPROVE` or `REJECT`;
- every mandatory report is accounted for in the table;
- required upstream statuses are explicit and readable;
- optional legacy artifacts are not treated as mandatory;
- git discipline is checked against `feature/fe-XX-...` and `commit_count <= 5`;
- evidence-path validation is explicit;
- month-view tasks explicitly include month-packing gate coverage;
- the report does not rewrite upstream ownership.

## Resource

Use:
- `references/gate-result-template.md` - canonical template for `gate_result.md`.
