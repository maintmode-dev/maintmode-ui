---
name: mcp-playwright-tools
description: This skill should be used when the agent needs to inspect or interact with maintmode-ui in a real browser through the available Playwright MCP tools, capture browser evidence, and keep all final artifacts under the current task root.
---

# MCP Playwright Tools

## Purpose

Use the available Playwright browser tools in a task-safe way for `maintmode-ui`.

Own only the browser-tool usage guidance:
- navigation and interaction;
- accessibility snapshots;
- screenshots;
- console and network evidence;
- task-local screenshot and artifact handling.

This helper skill does not decide PASS or FAIL on its own.

Use it to support:
- `fe-smoke-test-workflow`;
- `fe-aqa-workflow`;
- `fe-ui-inspector-workflow`;
- `fe-ux-reviewer-workflow`;
- targeted manual verification during `fe-dev`.

## When To Use

Use this skill when:
- the task needs browser interaction, screenshots, or accessibility snapshots;
- console or network inspection is needed;
- UI or UX review needs evidence from the live app;
- a task-local smoke pass needs browser artifacts.

Do not use this skill when:
- static code inspection is enough;
- no browser evidence is needed;
- the task has no reachable local surface to inspect.

## Required Inputs

Load these inputs when relevant:
- the current task file, or at minimum the current task root;
- `.kilo/kilo.json`;
- the relevant UI or UX source-of-truth files if the browser work supports a review stage;
- the exact route or scenario that should be exercised.

## MCP Configuration

The Playwright MCP setup for this repository lives in:
- `.kilo/kilo.json`

Key repository assumptions:
- the Playwright MCP server uses `npx @playwright/mcp@0.0.38`;
- screenshots are written to the staging directory `screenshots/`;
- final report evidence must never point to `screenshots/` directly.

## Tooling Rules

Use the available Playwright MCP browser tools for the current environment.

Typical operations include:
- navigate to a page;
- capture an accessibility snapshot;
- take screenshots;
- inspect console messages;
- inspect network requests;
- click, type, hover, or select;
- evaluate small JavaScript snippets when layout or DOM facts must be confirmed.

Prefer the smallest interaction needed to confirm the fact in question.

## Artifact Policy

Treat `screenshots/` as staging only.

Final evidence must live under the current task root:
- `.agents/tasks/<backlog|todo>/fe-XX/artifacts/screenshots/`
- `.agents/tasks/<backlog|todo>/fe-XX/artifacts/<type>/`

After each screenshot:
- move it from staging into the task-local artifact directory;
- reference only the task-local path in reports.

Do not leave final report links pointing at shared staging directories.

Typical screenshot flow:
1. ensure `.agents/tasks/<backlog|todo>/fe-XX/artifacts/screenshots/` exists;
2. take a screenshot with a temporary filename;
3. move the file from `screenshots/` into the task-local artifact directory;
4. reference only the task-local path in reports.

## Workflow

1. Derive the task root from the active task file when the work belongs to a task.
2. Confirm the local app route to inspect.
3. Confirm the local app is reachable before collecting evidence.
4. Resize or switch viewport only when the scenario requires it.
5. Capture the minimum useful browser evidence.
6. Move staging screenshots into the task-local artifact directory.
7. Record only factual observations in the downstream report that uses the evidence.

## Blocked Conditions

Treat browser evidence collection as blocked if any of the following is true:
- the local app is not reachable;
- the browser environment is unavailable;
- the task root is unknown and final artifact storage would become ambiguous;
- required auth, fixture, or data setup is missing.

When blocked:
- record the blocker in the downstream report;
- do not pretend the evidence was collected.

## Quality Checklist

Before finishing work that uses this helper, verify that:
- browser evidence is tied to a concrete scenario;
- screenshots and logs use task-local final paths only;
- console and network findings are recorded as facts, not interpretations;
- screenshots are captured only when they materially help the task;
- the helper is not used as a substitute for the actual review or gate skill.

## Resource

Use:
- `.kilo/kilo.json` - Playwright MCP server configuration;
- `.agents/project-details/ui-specific/ui_rules.md` - formal UI rules when collecting UI evidence;
- `.agents/project-details/ui-specific/ux_heuristics.md` - UX heuristics when collecting operator-facing UX evidence.
