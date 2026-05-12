---
name: fe-smoke-test
description: Use this skill to run a lightweight browser smoke pass for a `maintmode-ui` change, capture screenshots/console/network evidence, and save a smoke report under the task root.
---

# FE Smoke Test

## Purpose

Run a lightweight browser smoke pass for the changed frontend flow and
record the result under the task root.

## When To Use

- the changed flow is user-facing and benefits from a browser sanity pass;
- the task names smoke scenarios;
- a quick post-implementation regression check is needed.

Do not use this skill when:

- the task is backend-only or documentation-only;
- the requested validation is already fully covered by deterministic
  automated tests and no browser evidence is needed;
- browser execution is unavailable and the task does not justify a manual
  smoke fallback.

## Required Inputs

- the task file from `.agents/tasks/<backlog|todo>/<task-id>/<task-id>.md`;
- `implementation_report.md` when available;
- the smoke scenarios, routes, and acceptance criteria for the changed flow.

When the smoke pass uses Playwright MCP screenshots, follow
`.agents/skills/mcp-playwright-tools/SKILL.md` and place final files under
`artifacts/screenshots/` inside the task root (not in any tool staging
directory).

## What To Check

At minimum:

- page load;
- core interaction or navigation path relevant to the task;
- obvious console or network failures;
- task-specific regression guards called out by the task pack.

Capture only the evidence needed to support the smoke result.

## Artifact Policy

Use only task-local paths:

- `.agents/tasks/<backlog|todo>/<task-id>/reports/smoke_test_report.md`
- `.agents/tasks/<backlog|todo>/<task-id>/artifacts/screenshots/`
- `.agents/tasks/<backlog|todo>/<task-id>/artifacts/<type>/`

If a tool writes to a staging directory (e.g. project-root `screenshots/`),
move the files into the task-local artifact directory before referencing
them in the report.

## Blocked Conditions

Treat the smoke pass as blocked if any of:

- the dev server cannot be started or reached;
- the browser environment is unavailable;
- required fixtures, auth state, or backend dependencies are missing;
- the changed path cannot be exercised locally.

When blocked: write the exact blocker into the smoke report; do not mark
it `PASS`.

## Output Artifact

Save exactly one smoke report:

- `.agents/tasks/<backlog|todo>/<task-id>/reports/smoke_test_report.md`

The report must distinguish `PASS`, `FAIL`, and environment blockers
clearly; record screenshots/logs with task-local paths only; surface
console or network issues factually; call out any uncovered scenario
explicitly instead of implying it as verified.

## Resource

Use `references/smoke-test-report-template.md` as the canonical template.
