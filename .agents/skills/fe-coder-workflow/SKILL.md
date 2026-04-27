---
name: fe-coder-workflow
description: This skill should be used when the agent is in the fe-dev implementation step and needs to execute an approved frontend architecture plan in maintmode-ui, update code within scope, and produce an implementation report without re-owning tasking or final AQA decisions.
---

# FE Coder Workflow

## Purpose

Implement the frontend changes defined by the task file and architecture plan for `maintmode-ui`.

Use this skill to turn an approved architecture plan into scoped code changes and a concrete implementation handoff.

This skill does not replace task creation, architecture planning, or final AQA.

Treat these skills as the owners of adjacent responsibilities:
- [`.agents/skills/fe-task-creator/SKILL.md`](../fe-task-creator/SKILL.md) for task framing, canonical paths, workflow ownership, and task-pack contracts;
- [`.agents/skills/fe-architect-workflow/SKILL.md`](../fe-architect-workflow/SKILL.md) for implementation slices, architecture decisions, and remediation planning after `REJECT`;
- `fe-aqa-workflow` for the final technical quality report in `aqa_report.md`.

Own only the implementation-stage delta:
- apply the approved plan to the codebase;
- keep changes inside scope and contract boundaries;
- update or add code-level validation when it is part of scope;
- record what changed, what was checked locally, and what remains notable for downstream review.

## When To Use

Use this skill when:
- the task file already exists under `.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md`;
- the workflow is in `fe-dev`;
- a valid `architecture_plan.md` exists for the same task root;
- product code must be changed inside the approved frontend scope.

Do not use this skill when:
- the task is still being shaped;
- no architecture plan exists for a task that requires one;
- the work is review-only, QA-only, or gate-only;
- the requested work is backend-only and does not belong to the frontend execution stage.

## Required Inputs

Load these inputs first:
- the task file from `.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md`;
- `.agents/tasks/<backlog|todo>/fe-XX/reports/architecture_plan.md`;
- the task root derived from `Task File`;
- the current code for the files and modules that are in scope.

Load these additional inputs only when relevant:
- task-referenced canonical contracts such as `AGENTS.md`, UI rules, UX heuristics, month packing, and backend swagger;
- existing tests or smoke specs in scope;
- prior `gate_result.md` and review reports during a remediation cycle.

Inspect only the code and contracts needed to execute the assigned implementation slices safely.

## Preconditions

Before coding, verify all of the following:
- `Task File` uses a canonical `.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md` path;
- the task file status is `READY`;
- `Execution Mode` is `fe-dev`;
- `architecture_plan.md` exists under the same task root;
- the architecture plan is not blocked;
- the requested changes fit within `Scope In`.

If a precondition fails, do not continue with product-code changes. Record the blocker and hand the issue back through the architecture or tasking path as appropriate.

## Scope Ownership

Do not silently rewrite task-pack or architecture-plan ownership boundaries.

Do not silently change:
- `Scope In`;
- `Scope Out`;
- `Acceptance Criteria`;
- `Constraints`;
- architecture decisions that define boundaries or sequencing.

If the approved plan cannot be implemented safely as written:
- stop at the safe boundary;
- document the conflict or blocker;
- hand the task back for architecture remediation instead of improvising a wider solution.

## Allowed Actions

Allowed:
- edit product code inside approved scope;
- add or update tests when tests are in scope or directly required to protect the changed behavior;
- update local adapters, mappers, UI components, route handlers, and utilities inside task boundaries;
- run local commands needed to validate the implementation step;
- prepare `implementation_report.md` for downstream AQA and review stages.

Forbidden:
- expand the task into unrelated refactors;
- bypass route-handler boundaries and connect the browser UI directly to backend APIs;
- move backend DTO concerns into UI components;
- disable or weaken checks just to get a green result;
- treat optional legacy helpers as mandatory dependencies;
- make gate decisions.

## Workflow

1. Open the task file and the architecture plan.
2. Read only the sections needed for implementation:
   - scope
   - constraints
   - requirements
   - acceptance criteria
   - verification expectations
   - architecture decisions
   - implementation slices
   - handoff notes
3. Inspect the current code only for the files and modules relevant to the assigned slices.
4. Implement the changes incrementally.
5. Keep the approved boundaries stable while coding.
6. Run the local checks that are relevant to the changed code and available in the environment.
7. Record the implementation result in `.agents/tasks/<backlog|todo>/fe-XX/reports/implementation_report.md` using `references/implementation-report-template.md`.
8. Hand the task forward with clear notes for `fe-aqa`, `fe-ui-inspector`, and `fe-ux-reviewer`.

## Project-Specific Implementation Rules

Apply these rules when they match the task:
- keep backend access behind `src/app/api/maintenance/**`;
- keep backend/frontend status mapping centralized, especially `canceled` <-> `cancelled`;
- keep transport dates in ISO 8601 and avoid spreading `Date` parsing into shared transport layers;
- keep backend DTO details out of UI components;
- prefer small incremental changes over broad refactors;
- preserve adapter and normalization boundaries defined by the architecture plan.

If the task affects month view:
- preserve `.agents/project-details/ui-specific/calendar_month_packing.md`;
- keep `spanning` above `timed-single-day`;
- keep `+N more` at the bottom of the day cell;
- avoid custom layout drift unless the architecture plan explicitly allows it.

## Local Validation Rules

This skill may run local implementation checks, but it does not own final AQA status.

Before handoff, run the minimum relevant checks that are available for the changed scope, for example:
- lint;
- build;
- targeted tests;
- targeted smoke or manual verification.

Do not claim repository-wide validation if only targeted checks were run.

If a useful check cannot run:
- document the exact limitation in the implementation report;
- do not hide the gap behind vague wording.

## Blocked Conditions

Treat the implementation step as blocked if any of the following is true:
- the architecture plan is missing, blocked, or conflicts with the current code in a way that changes execution meaning;
- required environment, dependency, fixture, or contract data is missing;
- the requested fix would require guessing outside the approved plan;
- a critical local check fails and the failure cannot be resolved within scope.

When blocked:
- stop at the safe boundary;
- save the implementation report anyway;
- document exactly what was changed, what was attempted, and what prevents completion.

## Output Artifact

Save exactly one implementation artifact from this skill:
- `.agents/tasks/<backlog|todo>/fe-XX/reports/implementation_report.md`

Use the same task root as `Task File`.

Do not mix `backlog` and `todo` in one report.

## Required Sections Of `implementation_report.md`

The implementation report must include:
- report status;
- task reference;
- implementation summary;
- changed files;
- implementation notes by area;
- contract preservation notes;
- local checks run;
- unresolved issues or limits;
- git status summary;
- handoff notes for downstream stages.

If a section is not relevant, write `None`.

## Handoff To `fe-aqa` And Review Stages

The implementation handoff is ready only when it gives a concrete answer to all of the following:
- what changed;
- where it changed;
- which contracts or boundaries were intentionally preserved;
- which checks already ran and what they proved;
- which gaps or caveats remain;
- what downstream reviewers should pay attention to.

Do not hand off vague guidance such as:
- "changes implemented";
- "tested locally";
- "should work";
- "review everything".

## Quality Checklist

Before finalizing the skill output, verify that:
- the implementation report path uses the same task root as `Task File`;
- the implementation stays inside `Scope In`;
- changed files are traceable to implementation slices or directly adjacent code required by those slices;
- contract-preservation notes are explicit for integration-sensitive changes;
- the report distinguishes between checks actually run and checks deferred to AQA;
- month-view tasks explicitly note month-packing preservation;
- blocked reports explain the exact execution blocker;
- the report does not require separate optional review or reporting helpers to be considered complete.

## Resource

Use:
- `references/implementation-report-template.md` - canonical template for `implementation_report.md`.
