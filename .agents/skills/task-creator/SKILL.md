---
name: task-creator
description: This skill should be used when the agent needs to turn a user request into a structured Markdown task file with explicit scope, expected outcome, role, decision points, checks, and blocking questions before implementation starts.
---

# Task Creator

## Purpose

Create a reusable task in Markdown for another AI agent or engineer.

Save the task to:
- `.agents/tasks/todo/<task-id>/<task-id>.md`

Use:
- `references/task-template.md`

Treat this skill as a universal base contract. Project-specific tasking skills may extend it with stricter naming, extra sections, or domain-specific rules, but must preserve these core constraints:
- perform discovery before task creation;
- separate confirmed facts from assumptions;
- define explicit scope;
- make requirements and acceptance criteria traceable;
- make acceptance criteria and checks testable;
- mark unclear tasks as `BLOCKED` instead of guessing.

## When To Use

Use this skill when:
- a user describes a feature, bug, refactor, integration, research, documentation, or QA request;
- a task must be prepared before implementation starts;
- work must be delegated to another AI agent or engineer;
- the request needs clearer scope, role selection, checks, or open questions.

Do not use this skill when:
- the user explicitly asks to execute the work immediately without a separate tasking step;
- the user already has a final task and only needs light editing.

## Required Output

Produce exactly two outputs:
- a saved Markdown task file based on `references/task-template.md`;
- a short user-facing summary that states the task path, status, and whether open questions remain.

## Task Language

Write saved task files in concise technical English by default.

Use technical English for:
- task titles;
- task descriptions;
- requirements;
- acceptance criteria;
- verification steps;
- contracts;
- risks, assumptions, and open questions.

Do not mix languages inside the same task file.

Keep code identifiers, routes, endpoints, UI labels, and literal keywords unchanged when they are part of the contract.

Project-specific descendant skills may override this only when the project explicitly requires a different task language.

## Workflow

1. Capture the request without expanding it beyond confirmed facts.
2. Determine the task type.
3. Select the primary role and, if necessary, supporting roles.
4. Review only the files, docs, issues, or contracts that are relevant to the request.
5. Record exactly what was checked and what each checked source confirmed.
6. Separate facts, assumptions, dependencies, unresolved questions, and historical references.
7. Record decision points whenever the task already implies a chosen direction or a trade-off.
8. Decide whether the task is `READY` or `BLOCKED`.
9. Fill every required section of the Markdown template.
10. Save the task file to `.agents/tasks/todo/<task-id>/<task-id>.md`.

## Task Type Selection

Choose the most fitting task type:
- `feature` - new capability or user-visible extension;
- `bugfix` - restore expected behavior;
- `refactor` - improve structure without intended behavior change;
- `integration` - connect systems, contracts, or environments;
- `research` - analyze and recommend without implementation;
- `documentation` - create or update docs, guides, specs, or reports;
- `qa` - validate, test, reproduce, or audit.

## Role Selection

Select exactly one `Primary Role`.

Add `Supporting Roles` only if a single role cannot own the task coherently.

Default mapping:
- backend changes -> `backend developer`
- UI or frontend behavior changes -> `frontend developer`
- cross-system design or major decomposition -> `architect`
- unclear requirements or process design -> `analyst`
- validation-heavy or test-heavy work -> `qa engineer`
- docs-first work -> `technical writer` or `analyst`

If the task spans multiple domains:
- keep one primary owner;
- list the others as supporting roles;
- do not assign multiple primary owners;
- do not turn the task into a generic multi-role dump.

## Discovery Rules

Before marking a task `READY` or `BLOCKED`:
- inspect only relevant files and documents;
- prefer local code and project docs over assumptions;
- record exactly what was checked;
- explain what each checked source confirmed;
- if discovery was not needed, explicitly state why.

If a missing answer can be obtained from the repository or provided docs, obtain it before asking the user.

Do not ask the user for information that can be derived from available sources.

Do not scan the whole project if the task can be grounded through a smaller relevant subset.

## Source Classification Rules

`Source of Truth` must contain only canonical inputs that define expected behavior, scope, rules, or contracts.

Examples:
- project rules;
- API contracts;
- design specs;
- source code that defines current behavior;
- approved architecture documents.

`References / Previous Inputs` must contain historical or secondary inputs that inform the task but do not define the final contract.

Examples:
- previous task files;
- old drafts;
- issue descriptions;
- chat notes;
- prior reports.

Do not place previous tasks, drafts, or discussions into `Source of Truth` unless they are explicitly canonical.

## Status Rules

Do not mark a task as `READY` unless all of the following are true:
- the requested outcome is clear enough to execute;
- `Scope In` and `Scope Out` are concrete;
- the role fits the task;
- the requirements are actionable;
- the acceptance criteria are testable;
- the verification plan is specific enough to run.

Mark the task as `BLOCKED` if any of the following is true:
- required information is missing;
- there are two or more realistic directions with no confirmed choice;
- the task depends on an external decision, contract, or artifact that is not available;
- safe execution would require guessing.

For `BLOCKED` tasks:
- keep the draft task file;
- fill `Open Questions`;
- add one entry per blocking point;
- include options, trade-offs, and a recommended direction for each blocking point;
- do not present the task as execution-ready.

## Content Rules

Every generated task must include:
- a specific title;
- a short task description;
- an expected outcome in business, user, or system terms;
- a concise project context section;
- a discovery summary;
- a `Source of Truth` section;
- a `References / Previous Inputs` section;
- a `Decision Points` section;
- explicit `Scope In`;
- explicit `Scope Out`;
- concrete requirements;
- testable acceptance criteria;
- a verification plan;
- a `Task-Specific Contracts` section;
- a `Validation Gaps` section;
- dependencies and blockers when present;
- open questions when unresolved;
- a recommended approach.

Write with these constraints:
- do not invent facts, APIs, contracts, or project rules;
- do not hide scope expansion inside vague wording;
- do not write generic criteria such as "works correctly" or "improve UX";
- do not leave critical assumptions implicit.

Use direct instructional wording.

Prefer specific verbs over generic phrasing.

Do not leave required sections blank. If a section is not applicable, state `None` and keep the reason obvious from context.

## Structured Entry Rules

Each requirement entry must include:
- `id`
- `requirement`
- `rationale`
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

`Task-Specific Contracts` must be used when the task needs exact sub-contracts that cannot be expressed safely through generic requirements alone.

If no task-specific contract is needed, write `None`.

`Validation Gaps` must explicitly record what cannot be fully validated at tasking time, why, and how the gap should be handled later.

If no validation gap exists, write `None`.

## Verification Rules

Always add a `Verification` section.

For development tasks, include all of the following:
- `Automated Checks`
- `Manual Checks`
- `Acceptance Test Cases`

For non-development tasks:
- keep `Automated Checks` only if relevant;
- replace development-style acceptance tests with a review-oriented checklist if needed;
- keep checks specific and observable.

Do not use placeholder checks such as "run tests" or "verify manually". Name the actual command, scenario, or expected observation.

## File Save Rules

When saving a task:
- create the task directory if it does not exist;
- keep the filename equal to the `task-id`;
- store the file under `.agents/tasks/todo/<task-id>/<task-id>.md`;
- use `references/task-template.md` as the canonical structure.

This universal skill uses the current repository path convention.
Specialized descendant skills may narrow task-id formats or save paths, but must do so explicitly.

## Quality Checklist

Before finalizing the task, verify that:
- the title is specific;
- the task type matches the request;
- the primary role is appropriate;
- discovery is recorded;
- `Source of Truth` contains only canonical inputs;
- `References / Previous Inputs` contains non-canonical historical inputs;
- `Scope In` and `Scope Out` do not overlap;
- requirements are concrete and structured;
- acceptance criteria are structured and testable;
- decision points are explicit when choices exist;
- checks are executable;
- task-specific contracts are explicit when needed;
- validation gaps are explicit when they exist;
- open questions are separated from confirmed requirements;
- the task status is justified;
- the file is saved in the canonical path.

Reject the draft internally and rewrite it if any checklist item fails.

## Resource

Use:
- `references/task-template.md` - canonical Markdown template for saved task files.
