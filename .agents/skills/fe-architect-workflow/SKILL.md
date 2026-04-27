---
name: fe-architect-workflow
description: This skill should be used when the agent is in the fe-architect stage and needs to analyze a READY frontend task plus the relevant maintmode-ui code in order to produce an implementation-ready architecture plan without writing product code.
---

# FE Architect Workflow

## Purpose

Produce an implementation-ready architecture plan for `maintmode-ui`.

Use this skill to refine an existing frontend task into an executable technical plan.

This skill does not replace task creation.

Treat [`.agents/skills/fe-task-creator/SKILL.md`](../fe-task-creator/SKILL.md) as the owner of:
- task framing;
- canonical task paths;
- `READY` versus `BLOCKED` task-pack rules;
- selected skills;
- workflow sequence;
- stage outputs;
- language rules;
- source classification rules.

Own only the architecture-stage delta:
- analyze the task against the current code;
- identify technical boundaries and affected modules;
- define implementation slices and sequencing;
- document risks, handoff criteria, and remediation updates.

## When To Use

Use this skill when:
- the task file already exists under `.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md`;
- the workflow is entering `fe-architect`;
- the next step is to prepare `fe-dev` for safe implementation;
- a previous `fe-gate` result is `REJECT` and the architecture plan must be updated.

Do not use this skill when:
- the user is still shaping the task;
- the task is backend-only and has no frontend architecture stage;
- the work should go directly to implementation with no separate architecture artifact.

## Required Inputs

Load these inputs first:
- the task file from `.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md`;
- the task root derived from `Task File`;
- the relevant `Source of Truth` entries listed in the task file;
- the current code for the files and modules that are in scope.

Load these additional inputs only when relevant:
- `.agents/project-details/ui-specific/ui_rules.md` for UI-rule-sensitive tasks;
- `.agents/project-details/ui-specific/ux_heuristics.md` for UX-sensitive tasks;
- `.agents/project-details/ui-specific/calendar_month_packing.md` for month-view tasks;
- the backend swagger contract for API and integration tasks;
- `implementation_report.md`, `aqa_report.md`, `ui_inspector_report.md`, `ux_report.md`, and `gate_result.md` during remediation.

Inspect only the code and contracts needed to produce a reliable technical plan.

## Preconditions

Before writing the plan, verify all of the following:
- `Task File` uses a canonical `.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md` path;
- the task file status is `READY`, unless an architecture conflict forces a new block;
- `Entry Mode` is `fe-architect`;
- the task defines enough scope and acceptance criteria to support technical decomposition.

If any precondition fails, do not silently continue. Record the problem in the plan and treat the architecture stage as blocked.

## Scope Ownership

Do not silently rewrite task-pack ownership boundaries.

Do not silently change:
- `Scope In`;
- `Scope Out`;
- `Acceptance Criteria`;
- `Selected Skills`;
- `Execution Workflow`;
- `Stage Outputs`.

If the task file conflicts with code or canonical sources:
- record the mismatch as an `Architecture Conflict`;
- explain the impact on safe execution;
- mark the plan `BLOCKED`;
- surface the exact resolution needed.

## Allowed Actions

Allowed:
- inspect current frontend code and route handlers;
- inspect canonical contracts referenced by the task file;
- narrow the technical change surface within `Scope In`;
- define file-level and module-level change boundaries;
- define implementation slices, sequencing, and dependency order;
- document risks, trade-offs, and fallback options;
- prepare remediation updates after `REJECT`.

Forbidden:
- write production code;
- change the task pack silently;
- make gate decisions;
- replace canonical source-of-truth with inference;
- expand the task into unrelated refactors.

## Workflow

1. Open the task file and derive the task root from `Task File`.
2. Read only the task sections needed for architecture work:
   - `Task Description`
   - `Business Goal`
   - `Scope In`
   - `Scope Out`
   - `Constraints`
   - `Frontend Requirements`
   - `Acceptance Criteria`
   - relevant contracts
   - `Verification Matrix`
3. Inspect only the relevant current code and canonical sources.
4. Compare the task pack to the code and contracts.
5. If a mismatch blocks safe execution, record an `Architecture Conflict` and stop planning beyond the safe boundary.
6. Define the architecture decisions needed for implementation.
7. Break the work into implementation slices that `fe-dev` can execute incrementally.
8. For each slice, identify affected files, contract notes, verification expectations, and local risks.
9. Save the plan to `.agents/tasks/<backlog|todo>/fe-XX/reports/architecture_plan.md` using `references/architecture-plan-template.md`.
10. During remediation, read the gate and review reports, update the plan with a remediation delta, and hand the task back to `fe-dev`.

## Project-Specific Architecture Rules

Apply these rules when they match the task:
- keep backend access behind `src/app/api/maintenance/**`;
- keep backend/frontend status mapping centralized, especially `canceled` <-> `cancelled`;
- keep transport dates in ISO 8601 and avoid moving `Date` parsing deeper into shared data layers;
- keep backend DTO details out of UI components;
- prefer small incremental changes over broad refactors;
- for integration tasks, define the adapter boundary and normalization boundary explicitly.

If the task affects month view:
- include `.agents/project-details/ui-specific/calendar_month_packing.md` in the architecture analysis;
- preserve the contract that `spanning` ranks above `timed-single-day`;
- preserve `+N more` at the bottom of the day cell;
- make the month-packing impact explicit in the plan.

## Blocked Conditions

Mark the plan `BLOCKED` if any of the following is true:
- the task file conflicts with current code or canonical contracts in a way that changes execution meaning;
- the scope is too broad or too vague for safe technical decomposition;
- a required contract, design input, or API detail is missing;
- the requested change would require guessing across system boundaries.

When blocked:
- still save the architecture plan;
- explain what was checked;
- document the exact blocking conflict or missing input;
- list the minimum follow-up needed to resume execution.

## Output Artifact

Save exactly one architecture artifact:
- `.agents/tasks/<backlog|todo>/fe-XX/reports/architecture_plan.md`

Use the same task root as `Task File`.

Do not mix `backlog` and `todo` in one plan.

## Required Sections Of `architecture_plan.md`

The architecture plan must include:
- plan status;
- task reference;
- architecture objective;
- scope guardrails;
- codebase findings;
- architecture conflicts;
- architecture decisions;
- implementation slices;
- integration and data boundaries;
- month-view impact;
- risks and mitigations;
- handoff to `fe-dev`;
- remediation strategy;
- open questions.

If a section is not relevant, write `None`.

## Handoff To `fe-dev`

The plan is ready for `fe-dev` only when it gives a concrete answer to all of the following:
- what should be built first;
- which files or modules are expected to change;
- which contracts must stay stable;
- where normalization or adapter boundaries belong;
- which risks must be watched during implementation;
- which verification points matter for the changed flow.

Do not hand off vague guidance such as:
- "implement the feature";
- "update the UI";
- "connect the backend";
- "verify everything works".

## Remediation Loop

Use this same skill again after `fe-gate` returns `REJECT`.

During remediation:
- read `gate_result.md`;
- read the latest `implementation_report.md`, `aqa_report.md`, `ui_inspector_report.md`, and `ux_report.md`;
- identify whether the failure is architectural, execution-level, or verification-level;
- update only the parts of the plan that need correction;
- add a remediation delta that explains what `fe-dev` must change next.

If `gate_result.md` is `APPROVE`, do not reopen the plan.

## Quality Checklist

Before finalizing the skill output, verify that:
- the plan path uses the same task root as `Task File`;
- the plan does not duplicate tasking-owned sections beyond what is needed for technical execution;
- code and contract findings are grounded in inspected sources;
- every implementation slice is concrete enough for `fe-dev`;
- integration tasks define adapter and normalization boundaries explicitly;
- month-view tasks reference the month-packing contract explicitly;
- blocked plans explain the exact blocking reason;
- remediation updates are additive and targeted, not full rewrites without cause.

## Resource

Use:
- `references/architecture-plan-template.md` - canonical template for `architecture_plan.md`.
