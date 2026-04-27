---
name: fe-task-creator
description: This skill should be used when the agent needs to create a frontend task file for maintmode-ui with FE task IDs, project-specific source-of-truth checks, explicit frontend contracts, and the repository's fixed frontend workflow.
---

# FE Task Creator

## Purpose

Create a project-specific frontend task in Markdown for `maintmode-ui`.

Apply the base contract from:
- `../task-creator/SKILL.md`

Use this skill to narrow the universal tasking rules to this repository's frontend process.

Save every task to one of these canonical paths:
- `.agents/tasks/backlog/fe-XX/fe-XX.md` for queued work;
- `.agents/tasks/todo/fe-XX/fe-XX.md` for activated work.

Do not save tasks outside `.agents/tasks/<backlog|todo>/fe-XX/`.

Use:
- `references/task-template.md`

Write:
- task titles in concise technical English;
- saved task files in concise technical English;
- user-facing tasking summaries in the current conversation language unless the user explicitly requests English.

Use technical English for all narrative task sections.

Keep these as literals when relevant:
- code identifiers;
- route paths;
- API fields and endpoint names;
- literal UI labels when they are part of the product contract;
- skill names;
- exact file paths.

Do not mix Russian and English inside the task file.

## Technical English Rules

Before finalizing the task file:
- run one terminology-consistency pass over the full document;
- keep the title, description, business goal, discovery findings, requirements, criteria, contracts, selected-skill reasons, workflow goals, implementation plan, risks, assumptions, validation gaps, and open questions in technical English;
- use stable terms consistently across the task file;
- remove accidental mixed-language prose or foreign-script tokens.

Prefer precise technical English over colloquial wording.

If a concept has an exact established technical name in English:
- use the English term consistently;
- do not translate it back and forth across sections.

Keep the prose direct, operational, and unambiguous.

## When To Use

Use this skill when the request belongs to this repository and the main work is frontend-oriented:
- UI changes;
- calendar behavior changes;
- maintenance details view changes;
- frontend integration with backend API wrappers;
- frontend refactors;
- frontend QA, smoke, or validation tasks;
- frontend architecture or frontend discovery tasks.

Do not use this skill when:
- the task is backend-only and does not require frontend tasking;
- the task is generic and not tied to `maintmode-ui`;
- the user explicitly asks to implement immediately without a separate tasking step.

## Required Base Contract

Before using this skill:
- load `../task-creator/SKILL.md`;
- follow all base rules from the universal `task-creator`;
- apply the project-specific restrictions below.

If this skill conflicts with the universal skill:
- use this skill as the narrower contract for this repository.

## Required Sources Of Truth

Always inspect:
- `AGENTS.md`

Inspect only the sources that are relevant to the current task:
- `.agents/project-details/ui-specific/ui_rules.md` if the task affects UI structure, visibility, styling, or visual states;
- `.agents/project-details/ui-specific/ux_heuristics.md` if the task affects usability, hierarchy, operator flow, or information density;
- `.agents/project-details/ui-specific/calendar_month_packing.md` if the task touches month view behavior;
- `https://github.com/ruko1202/maintmode/blob/main/docs/swagger.yaml` if the task affects API integration or backend contracts;
- current frontend code in `src/**`;
- current route handlers in `src/app/api/maintenance/**` if the task affects data flow or integration;
- current task files in `.agents/tasks/backlog/fe-XX/` and `.agents/tasks/todo/fe-XX/` when the task depends on earlier FE work.

Do not ask the user for information that can be derived from these sources.

## Source Classification Rules

`Source of Truth` must contain only canonical frontend inputs:
- project rules from `AGENTS.md`;
- approved UI or UX rules;
- approved backend contracts;
- current source code that defines live behavior;
- approved design or architecture inputs.

Every `Source of Truth` entry must also appear in `Discovery Summary -> What Was Checked`.

Do not list a canonical source in `Source of Truth` if it was not actually inspected for the current task.

`References / Previous Inputs` must contain non-canonical but useful inputs:
- previous task files;
- old reports;
- prior prompts;
- historical issues;
- superseded drafts.

Do not place previous FE tasks into `Source of Truth` unless they are explicitly canonical for the current task.

`Verification Inputs` must contain non-canonical verification artifacts:
- component tests;
- smoke specs;
- test fixtures;
- test configs;
- report templates;
- helper scripts used only to validate behavior.

Do not place tests or smoke specs into `Source of Truth` by default.

If a test file is treated as a canonical executable contract for the task:
- include it in both `What Was Checked` and `Source of Truth`;
- explain why it is canonical in `Discovery Summary -> Findings`.

## Canonical Conventions

Use these conventions in every new task file:
- task id: `fe-XX`
- task file: `.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md`
- git branch: `feature/fe-XX-<short-kebab-slug>`
- commit convention: `<type>(fe-XX): <summary>`
- allowed commit types: `feat|fix|refactor|test|docs|chore|perf`
- max commits per task: `5`

Use this fixed execution workflow:
- `entry_mode`: `fe-architect`
- `execution_mode`: `fe-dev`
- `workflow_sequence`: `fe-architect -> fe-dev -> fe-ui-inspector + fe-ux-reviewer -> fe-gate`

Use these canonical workflow skills in `Selected Skills` for `READY` execution tasks:
- `fe-task-creator`
- `fe-architect-workflow`
- `fe-coder-workflow`
- `fe-aqa-workflow`
- `fe-ui-inspector-workflow`
- `fe-ux-reviewer-workflow`
- `fe-gate-workflow`

Add optional project skills only if the task actually needs them:
- `fe-smoke-test-workflow`
- `mcp-playwright-tools`

Add generic legacy helpers only when the task explicitly needs them and no `.agents` equivalent exists:
- `webapp-testing`
- `vercel-react-best-practices`
- `create-pull-request`
- `code-review`

Do not use legacy workflow naming such as:
- `b2b-*`
- `vibe-*`

For `BLOCKED` tasks:
- include `fe-task-creator` in `Selected Skills`;
- include only the skills that are actively needed to resolve the blocking condition;
- if you list downstream execution skills for traceability, mark the reason explicitly as `planned after unblock`;
- do not imply that the full execution skill set is already active.

## Role Selection

Select exactly one `Primary Role`.

Use this mapping by default:
- UI component, page, interaction, layout, or rendering changes -> `frontend developer`
- frontend decomposition, integration strategy, complex calendar behavior, or architecture planning -> `frontend architect`
- unclear requirements, scope shaping, or source-of-truth conflict resolution -> `analyst`
- validation-heavy, reproduction-heavy, or acceptance-heavy work -> `qa engineer`

Add `Supporting Roles` only if the task cannot be executed coherently by a single primary role.

Do not assign multiple primary owners.

## Frontend-Specific Constraints

Always encode the relevant frontend constraints into the task.

Apply these rules when they match the task:
- do not connect the browser UI directly to backend APIs;
- route backend integration through `src/app/api/maintenance/**`;
- keep backend/frontend status mapping centralized, especially `canceled` <-> `cancelled`;
- keep dates in ISO 8601 across transport and storage boundaries;
- parse to `Date` only at rendering boundaries in the UI;
- do not mix backend DTOs directly into UI components;
- do not keep production behavior on `mock-data` when the task is about real integration;
- do not mass-refactor unrelated UI while the integration layer is still unstable;
- implement changes in small increments.

If the task touches month view:
- include `.agents/project-details/ui-specific/calendar_month_packing.md` in `Source of Truth`;
- add month-packing constraints explicitly;
- include verification for `spanning` priority, visible row limits, and `+N more` behavior.

## Frontend-Specific Blocks

The following blocks are first-class sections of the frontend task format.

Always include these universal blocks:
- `Decision Points`
- `References / Previous Inputs`
- `Task-Specific Contracts`
- `Validation Gaps`

Include these frontend-specific blocks explicitly when they are relevant:
- `Routing Contract` for navigation, deep links, restore logic, query params, or router state;
- `Interaction Contract` for CTA behavior, hidden or disabled states, action hierarchy, and user flow transitions;
- `Data Contract` for field mapping, DTO normalization, status mapping, time normalization, and data-shape constraints;
- `Designer Contract` for approved visual specs, layout contracts, block ordering, and UI redesign rules.

If a frontend-specific block is not relevant, write `None`.

Use `Task-Specific Contracts` for any additional exact sub-contracts that do not fit the named frontend blocks above.

## Discovery Rules

Before writing the task:
- inspect the minimum set of files needed to ground the request;
- record exactly what was checked;
- record what each checked source confirmed;
- separate confirmed facts from assumptions;
- surface inconsistencies between code, docs, and contracts.

For frontend tasks, prefer checking these areas when relevant:
- `src/app/page.tsx`
- `src/app/api/maintenance/**`
- `src/components/**`
- `src/types/**`
- `src/lib/**`
- relevant tests in `tests/**` or component test directories

Do not scan the entire repository if a smaller relevant subset is enough.

## READY / BLOCKED Rules

Do not mark a task as `READY` unless all of the following are true:
- the frontend outcome is clear enough to execute;
- `Scope In` and `Scope Out` are concrete at file, module, or route level;
- the chosen primary role fits the task;
- the frontend constraints are explicit;
- the acceptance criteria are testable;
- the verification matrix includes concrete checks;
- the fixed workflow and stage outputs are fully defined.

Mark the task as `BLOCKED` if any of the following is true:
- required frontend or contract information is missing;
- two or more realistic implementation directions exist without a confirmed choice;
- the task depends on an unavailable backend contract, design input, or product decision;
- safe execution would require guessing.

For `BLOCKED` tasks:
- keep the draft task file;
- fill `Open Questions`;
- add one question per blocking point;
- include options, trade-offs, and a recommended direction for each blocking point;
- do not present the task as execution-ready.

## Required Task Sections

Every generated task must use the Markdown structure from `references/task-template.md`.

The task must include:
- task title;
- status;
- task id and task file path;
- task path status;
- task type;
- priority;
- primary role and supporting roles;
- task description;
- business goal;
- project context;
- discovery summary;
- source of truth;
- references / previous inputs;
- verification inputs;
- decision points;
- scope in;
- scope out;
- constraints;
- frontend requirements grouped by category;
- UI states;
- acceptance criteria;
- routing contract;
- interaction contract;
- data contract;
- designer contract;
- task-specific contracts;
- verification matrix;
- selected skills;
- execution workflow;
- execution agents;
- implementation plan;
- git plan;
- deliverables;
- stage outputs;
- dependencies;
- blockers;
- risks;
- assumptions;
- validation gaps;
- open questions;
- recommended approach.

Do not leave required sections blank. If a section is not applicable, write `None`.

## Structured Entry Rules

Each frontend requirement entry must include:
- `id`
- `requirement`
- `rationale`
- `verification`

Each edge-case entry must include:
- `id`
- `case`
- `expected_handling`
- `verification`

Each acceptance criteria entry must include:
- `id`
- `text`
- `evidence`

Each decision point entry must include:
- `topic`
- `options`
- `chosen`
- `rationale`

Each task-specific contract entry must include:
- `name`
- `rules`
- `verification`

## Verification Matrix Rules

Use `Verification Matrix` as the canonical verification block for frontend tasks.

For tasks that include frontend code changes, the verification matrix must include:
- `Automated Checks`
- `Manual Matrix`
- `Acceptance Test Cases`
- `Testing Gaps`

If the task affects integration or route handlers, the matrix must explicitly cover the affected flow, for example:
- calendar loading;
- filters;
- details opening;
- save behavior;
- status transitions;
- error handling.

If the task affects month view, the matrix must explicitly cover the month-packing contract.

If `Scope In` includes tests, smoke specs, route handlers, or validation artifacts, the matrix must include either:
- an exact test command; or
- a `Testing Gap` entry explaining why that command cannot be provided yet.

Do not use vague checks such as:
- "run tests"
- "check UI"
- "verify manually"

Name the exact command, scenario, or expected observation.

Use `Testing Gaps` only for verification limitations tied to:
- missing or unavailable test environment;
- absent executable command;
- unavailable browser, server, fixture, or harness;
- test instability that prevents a reliable run.

Do not place broader product-validation blind spots into `Testing Gaps`.

Use `Validation Gaps` for broader residual uncertainty after the verification matrix, for example:
- production-only behavior that cannot be reproduced locally;
- missing observability or telemetry;
- upstream dependency behavior that cannot be validated now;
- scenarios intentionally left outside the current verification scope.

If all known validation limitations are already fully described in `Testing Gaps`, set `Validation Gaps` to `None`.

Do not duplicate the same gap in both sections unless the testing limitation creates an additional broader validation risk; if so, explain the broader impact explicitly.

## Stage Outputs

Every task must define these stage outputs:
- `fe-architect` -> `.agents/tasks/<backlog|todo>/fe-XX/reports/architecture_plan.md`
- `fe-dev` -> `.agents/tasks/<backlog|todo>/fe-XX/reports/implementation_report.md`
- `fe-dev` -> `.agents/tasks/<backlog|todo>/fe-XX/reports/aqa_report.md`
- `fe-ui-inspector` -> `.agents/tasks/<backlog|todo>/fe-XX/reports/ui_inspector_report.md`
- `fe-ux-reviewer` -> `.agents/tasks/<backlog|todo>/fe-XX/reports/ux_report.md`
- `fe-gate` -> `.agents/tasks/<backlog|todo>/fe-XX/reports/gate_result.md`

Artifacts must stay inside:
- `.agents/tasks/<backlog|todo>/fe-XX/artifacts/screenshots/`
- `.agents/tasks/<backlog|todo>/fe-XX/artifacts/<type>/`

Do not point final deliverables to shared directories such as `/tmp` or `screenshots/`.

All report paths, artifact paths, and deliverables must use the same task root as `Task File`.

Do not mix `backlog` and `todo` roots inside one task pack.

If the requested path does not match one of the canonical `.agents/tasks/<backlog|todo>/fe-XX/` roots:
- treat the request as non-canonical;
- do not silently normalize it;
- raise the mismatch to the user before finalizing the task pack.

## Task Path Status Rules

Use `Task Path Status` as an explicit metadata field for storage validity.

Allowed values:
- `canonical`
- `override-approved`

Use `canonical` only when `Task File` matches one of:
- `.agents/tasks/backlog/fe-XX/fe-XX.md`
- `.agents/tasks/todo/fe-XX/fe-XX.md`

When `Task Path Status` is `canonical`:
- omit the `Override Reason` subsection entirely.

Use `override-approved` only when:
- the user explicitly requested a non-canonical path;
- the task pack keeps all reports, artifacts, and deliverables under the same overridden root;
- the task includes `Override Reason` immediately under `Task Path Status`.

Do not use `override-approved` for silent drift or accidental path changes.

If the path is non-canonical and the user did not explicitly request it:
- do not mark the task as final;
- raise the mismatch before handoff.

## Selected Skills Rules

`Selected Skills` is a traceability block, not a free-form list.

Each selected skill entry must include:
- `Name`
- `Source`
- `Reason`

Use `Source: .agents` for skills that exist under `.agents/skills/**`.

Use `Source: legacy (.kilocode)` for project skills that still exist only under `.kilocode/skills/**`.

Prefer `.agents` skills when an equivalent exists there.

Do not imply that a skill exists under `.agents/skills` if it only exists in `.kilocode`.

## Quality Checklist

Before finalizing the task, verify that:
- the title is written in technical English;
- the task body is written in technical English except for required literals that must remain unchanged;
- the task file does not mix Russian and English prose;
- no narrative line contains accidental foreign-script garbage;
- the task id uses `fe-XX`;
- the file path uses `.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md`;
- `Task Path Status` matches the real path;
- `Override Reason` is omitted when the path is canonical;
- the primary role is correct;
- the checked files and docs are recorded;
- every `Source of Truth` entry also appears in `What Was Checked`;
- `Source of Truth` contains only canonical sources;
- `References / Previous Inputs` contains non-canonical historical inputs;
- `Verification Inputs` contains tests, smoke specs, and other non-canonical verification artifacts;
- `Scope In` and `Scope Out` do not overlap;
- frontend constraints are explicit and relevant;
- selected-skill reasons, workflow goals, and implementation steps also follow the technical-English rules;
- every requirement entry is structured and traceable;
- every acceptance criteria entry is structured and traceable;
- decision points are explicit when the task implies a chosen direction;
- routing, interaction, data, and designer contracts are present when relevant;
- task-specific contracts use structured entries when they are not `None`;
- the verification matrix includes exact commands, manual scenarios, acceptance cases, and testing gaps;
- `Testing Gaps` and `Validation Gaps` do not duplicate each other without explicit broader impact;
- the workflow sequence matches the project convention;
- selected skills identify whether they come from `.agents` or legacy `.kilocode`;
- stage outputs point to the task folder;
- every report and artifact path uses the same task root as `Task File`;
- `Override Reason` is present only when `Task Path Status` is `override-approved`;
- validation gaps are explicit when present;
- `Open Questions` are present for `BLOCKED` tasks and absent or `None` for `READY` tasks;
- month-view tasks explicitly reference the month-packing contract.

Reject the draft internally and rewrite it if any checklist item fails.

## Resource

Use:
- `references/task-template.md` - canonical Markdown template for project-specific frontend task files.
