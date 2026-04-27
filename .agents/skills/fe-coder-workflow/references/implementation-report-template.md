# Implementation Report: {Task ID} - {Task Title}

## Report Status
DONE
<!-- Allowed values: DONE, BLOCKED -->

## Task Reference
- Task File: `.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md`
- Architecture Plan: `.agents/tasks/<backlog|todo>/fe-XX/reports/architecture_plan.md`
- Report File: `.agents/tasks/<backlog|todo>/fe-XX/reports/implementation_report.md`
- Stage: `fe-dev`

## Implementation Summary
- {high-signal summary of what was implemented}
- {high-signal summary of what was implemented}

## Changed Files
- `{path}`
- `{path}`

## Implementation Notes By Area
### Area 1
- Goal: {what this area changed}
- Files:
  - `{path}`
  - `{path}`
- Notes:
  - {important implementation detail}
  - {important implementation detail}

### Area 2
- Goal: {what this area changed}
- Files:
  - `{path}`
- Notes:
  - {important implementation detail}

## Contract Preservation Notes
- {contract or boundary preserved}
- {contract or boundary preserved}
<!-- For integration tasks, call out adapter boundaries, DTO containment, status mapping, and time handling explicitly. -->

## Local Checks Run
- `{command}` -> PASS | FAIL | NOT_RUN
- `{command}` -> PASS | FAIL | NOT_RUN
<!-- Record only checks actually attempted during implementation. -->

## Unresolved Issues Or Limits
None
<!-- Use this section for known limits, deferred checks, environment blockers, or unresolved execution issues. -->

### Issue 1
- Type: {limitation | blocker | deferred validation}
- Description: {what remains unresolved}
- Impact: {why it matters}
- Next Step: {what downstream stage should do}

## Git Status Summary
- Branch: `feature/fe-XX-<short-kebab-slug>`
- Commits:
  - `{commit sha or message}`
  - `{commit sha or message}`
- Commit Count: `{n}`
<!-- If no commit was created yet, state that explicitly instead of leaving the field ambiguous. -->

## Handoff Notes
- For `fe-aqa`:
  - {what to validate next}
- For `fe-ui-inspector`:
  - {what UI-sensitive area needs attention}
- For `fe-ux-reviewer`:
  - {what UX-sensitive area needs attention}

## Open Follow-Ups
None
<!-- Use this section only when implementation finished with explicit follow-up items inside scope or immediately adjacent review scope. -->
