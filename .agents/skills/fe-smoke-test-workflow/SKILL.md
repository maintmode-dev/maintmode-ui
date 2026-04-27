---
name: fe-smoke-test-workflow
description: This skill should be used when the agent needs a lightweight task-local smoke pass for maintmode-ui after frontend changes, capture key browser evidence, and save a smoke report under the current task root.
---

# FE Smoke Test Workflow

## Purpose

Run a lightweight smoke pass for the changed frontend flow and record the result under the current task root.

Use this helper skill inside `fe-dev` or during targeted validation when:
- a fast browser-level sanity check is useful;
- the task already defines key user flows worth exercising;
- screenshots, console output, or network evidence should be captured.

This helper skill is optional.

It does not replace:
- `fe-aqa-workflow` for the technical PASS or FAIL verdict;
- `fe-ui-inspector-workflow` for formal UI-rule review;
- `fe-ux-reviewer-workflow` for operator-facing UX review;
- `fe-gate-workflow` for the final APPROVE or REJECT decision.

## When To Use

Use this skill when:
- the changed flow is user-facing and benefits from a browser sanity pass;
- the task or architecture plan names smoke scenarios;
- a quick post-implementation regression check is needed before handoff.

Do not use this skill when:
- the task is backend-only or documentation-only;
- the requested validation is already fully covered by deterministic automated tests and no browser evidence is needed;
- browser execution is unavailable and the task does not justify manual smoke fallback.

## Required Inputs

Load these inputs first:
- the task file from `.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md`;
- `.agents/tasks/<backlog|todo>/fe-XX/reports/implementation_report.md` when available;
- the relevant smoke scenarios, routes, and acceptance criteria for the changed flow.

Load when relevant:
- `.agents/skills/mcp-playwright-tools/SKILL.md`;
- `.kilo/kilo.json`;
- the changed smoke specs or test files;
- UI or UX rules if the smoke pass is also collecting evidence for later review.

## Preconditions

Before running the smoke pass, verify all of the following:
- the task root is known from `Task File`;
- the dev server is running, or can be started safely for the task;
- the changed route or flow can be exercised locally;
- screenshots and logs can be stored under the task-local artifact root.

If a precondition fails:
- record the blocker in the smoke report;
- do not claim the smoke pass completed successfully.

When the smoke pass uses Playwright MCP screenshots:
- treat `screenshots/` as staging only;
- move each screenshot into `.agents/tasks/<backlog|todo>/fe-XX/artifacts/screenshots/` before referencing it.

## Workflow

1. Derive the task root from `Task File`.
2. Open or start the local app needed for the changed flow.
3. Exercise the smallest meaningful user path for the task.
4. Confirm at minimum:
   - page load;
   - core interaction or navigation path relevant to the task;
   - obvious console or network failures;
   - task-specific regression guards called out by the task pack.
5. Capture only the evidence needed to support the smoke result.
6. Save screenshots and logs under the task-local artifact root.
7. Save `.agents/tasks/<backlog|todo>/fe-XX/reports/smoke_test_report.md` using `references/smoke-test-report-template.md`.

## Artifact Policy

Use only task-local final paths:
- `.agents/tasks/<backlog|todo>/fe-XX/reports/smoke_test_report.md`
- `.agents/tasks/<backlog|todo>/fe-XX/artifacts/screenshots/`
- `.agents/tasks/<backlog|todo>/fe-XX/artifacts/<type>/`

If a tool writes to a staging directory such as `screenshots/`:
- move the files into the task-local artifact directory before referencing them.

## Blocked Conditions

Treat the smoke pass as blocked if any of the following is true:
- the dev server cannot be started or reached;
- the browser environment is unavailable;
- required fixtures, auth state, or backend dependencies are missing;
- the changed path cannot be exercised in the local environment.

When blocked:
- write the exact blocker into the smoke report;
- do not mark the report as `PASS`.

## Quality Checklist

Before finalizing the smoke report, verify that:
- the checked scenario matches the task scope;
- the report distinguishes `PASS`, `FAIL`, and environment blockers clearly;
- screenshots and logs use task-local paths only;
- console or network issues are recorded factually;
- the report does not replace `aqa_report.md`;
- any uncovered scenario is called out explicitly instead of implied as verified.

## Resource

Use:
- `references/smoke-test-report-template.md` - canonical smoke report template;
- `.agents/skills/mcp-playwright-tools/SKILL.md` - browser evidence workflow and screenshot staging rules.
