---
name: fe-aqa-workflow
description: This skill should be used when the agent needs to validate a completed fe-dev implementation in maintmode-ui, run the relevant technical checks, and produce an explicit PASS or FAIL aqa report without re-owning coding or gate decisions.
---

# FE AQA Workflow

## Purpose

Validate the technical quality of a completed frontend implementation for `maintmode-ui`.

Use this skill after implementation work is finished and an `implementation_report.md` exists.

This skill does not replace coding, UI review, UX review, or gate.

Treat these skills as the owners of adjacent responsibilities:
- [`.agents/skills/fe-coder-workflow/SKILL.md`](../fe-coder-workflow/SKILL.md) for product-code changes and `implementation_report.md`;
- `fe-ui-inspector-workflow` for UI-rule validation;
- `fe-ux-reviewer-workflow` for UX risk review;
- `fe-gate-workflow` for the final binary decision.

Own only the technical validation-stage delta:
- run the relevant automated and manual technical checks;
- distinguish passed checks from missing or blocked checks;
- record explicit testing gaps and environment limits;
- produce `aqa_report.md` with a clear `PASS` or `FAIL`.

## When To Use

Use this skill when:
- the task file already exists under `.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md`;
- the workflow is still inside `fe-dev`, after implementation work;
- `implementation_report.md` exists for the same task root;
- technical validation must be recorded before UI and UX review.

Do not use this skill when:
- the implementation step is still incomplete;
- no implementation report exists for the task;
- the work is architecture-only, UI-review-only, UX-review-only, or gate-only.

## Required Inputs

Load these inputs first:
- the task file from `.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md`;
- `.agents/tasks/<backlog|todo>/fe-XX/reports/implementation_report.md`;
- `.agents/tasks/<backlog|todo>/fe-XX/reports/architecture_plan.md`;
- the task root derived from `Task File`.

Load these additional inputs only when relevant:
- the task's `Verification Matrix`;
- test files, smoke specs, fixtures, and validation helpers in scope;
- generated evidence logs stored inside the task folder;
- canonical contracts such as UI rules, UX heuristics, month packing, and backend swagger when a technical check depends on them.

Inspect only the inputs needed to decide technical validation status reliably.

## Preconditions

Before validating, verify all of the following:
- `Task File` uses a canonical `.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md` path;
- the task file status is `READY`;
- `implementation_report.md` exists under the same task root;
- the implementation report is not blocked;
- the relevant commands, fixtures, or manual flows are known from the task or current codebase.

If a precondition fails, do not invent missing validation context. Record the gap explicitly in the report.

## Scope Ownership

Do not silently take ownership of coding or gate decisions.

Do not silently change:
- implementation code to make tests pass;
- task requirements or acceptance criteria;
- architecture decisions;
- final gate verdict.

If validation reveals a product defect:
- record the failed check and the observed impact;
- set the report to `FAIL` when the defect blocks required verification;
- hand the result back to `fe-dev` for correction instead of patching the product code under AQA ownership.

## Allowed Actions

Allowed:
- run automated checks such as lint, build, targeted tests, and smoke checks;
- run manual technical checks when the task requires them;
- collect logs, screenshots, and other evidence inside the task folder;
- summarize technical findings and testing gaps in `aqa_report.md`.

Forbidden:
- rewrite the implementation silently;
- claim checks passed when they were not run;
- hide environment blockers behind generic wording;
- make UI or UX review findings in place of technical validation;
- make the final gate decision.

## Workflow

1. Open the task file, architecture plan, and implementation report.
2. Read only the sections needed for AQA work:
   - verification expectations
   - acceptance criteria
   - implementation summary
   - changed files
   - local checks already run
   - handoff notes
3. Determine the exact automated and manual checks that are relevant for the changed scope.
4. Run the available technical checks.
5. Record each executed check with its exact command or scenario and result.
6. Record environment blockers and missing coverage as explicit testing gaps.
7. Save the result to `.agents/tasks/<backlog|todo>/fe-XX/reports/aqa_report.md` using `references/aqa-report-template.md`.
8. Hand the task forward only when the report accurately reflects what passed, what failed, and what could not be validated.

## Status Rules

Set the AQA report to `PASS` only when:
- all required executed checks pass; and
- any remaining testing gaps are explicitly documented and do not invalidate the required technical confidence for this task.

Set the AQA report to `FAIL` when any of the following is true:
- a required automated or manual technical check fails;
- a required check cannot run and no acceptable substitute exists;
- the implementation report or current code reveals a technical regression that blocks required verification;
- the validation evidence is too incomplete to support a reliable technical pass.

If tests do not exist:
- record the absence as a testing gap;
- do not fail automatically unless the task explicitly required that test coverage or the missing coverage prevents a reliable decision.

## Project-Specific Validation Rules

Apply these rules when they match the task:
- prefer the exact commands named in the task file when they are still valid;
- if the workspace requires command adjustments, record the exact adjusted command and why it was needed;
- keep all evidence under `.agents/tasks/<backlog|todo>/fe-XX/artifacts/...`;
- do not use shared or temporary paths as final evidence links.

If the task affects month view:
- include an explicit technical check against `.agents/project-details/ui-specific/calendar_month_packing.md`;
- record whether month-packing behavior was validated by automated checks, manual checks, or both.

## Output Artifact

Save exactly one validation artifact from this skill:
- `.agents/tasks/<backlog|todo>/fe-XX/reports/aqa_report.md`

Use the same task root as `Task File`.

Do not mix `backlog` and `todo` in one report.

## Required Sections Of `aqa_report.md`

The AQA report must include:
- report status;
- task reference;
- automated checks;
- manual technical checks;
- findings or bugs;
- testing gaps;
- evidence;
- handoff notes.

If a section is not relevant, write `None`.

## Handoff To Review Stages

The AQA handoff is ready only when it gives a concrete answer to all of the following:
- which commands or scenarios were actually run;
- which checks passed;
- which checks failed;
- which testing gaps remain and why;
- where the evidence lives;
- whether downstream reviewers can trust the technical baseline.

Do not hand off vague guidance such as:
- "tests look good";
- "manual checks done";
- "probably fine";
- "no obvious issues".

## Quality Checklist

Before finalizing the skill output, verify that:
- the report path uses the same task root as `Task File`;
- every listed command or manual scenario was actually attempted or is clearly marked as not run;
- `PASS` or `FAIL` is explicit;
- testing gaps are concrete and non-duplicative;
- evidence paths stay inside the task folder;
- month-view tasks explicitly mention month-packing validation;
- the report does not hide implementation defects behind environment excuses;
- the report does not rewrite product code or gate ownership.

## Resource

Use:
- `references/aqa-report-template.md` - canonical template for `aqa_report.md`.
