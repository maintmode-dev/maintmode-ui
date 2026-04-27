# {Task Title}
<!-- Use a short, specific title. Do not use generic names like "Fix bug" or "Improve system". -->

## Status
READY
<!-- READY: enough confirmed information exists to start work safely and verify completion. -->
<!-- BLOCKED: required information, decisions, or dependencies are still missing; implementation must not start. -->

## Task ID
{task-id}
<!-- Keep this ID stable. Save path: .agents/tasks/todo/{task-id}/{task-id}.md -->

## Task File
.agents/tasks/todo/{task-id}/{task-id}.md

## Task Type
feature
<!-- Allowed examples: feature, bugfix, refactor, integration, research, documentation, qa -->

## Primary Role
{backend developer | frontend developer | architect | analyst | qa engineer | technical writer}

## Supporting Roles
None
<!-- If no supporting roles are needed, replace the list with "None". -->

## Task Description
{Describe the request or problem in 2-5 sentences without adding unconfirmed facts.}

## Expected Outcome
{Describe the target result in business, user, or system terms.}
{Explain what should be improved, enabled, clarified, or de-risked after the task is completed.}

## Project Context
{Add only the project context that is relevant to this task.}

## Discovery Summary
### What Was Checked
- {file / doc / issue / contract / endpoint / artifact}
- {file / doc / issue / contract / endpoint / artifact}

### Findings
- {confirmed fact}
- {identified constraint}
<!-- Record only what discovery actually confirmed. Do not mix in assumptions here. -->

## Source of Truth
- {canonical source 1}
- {canonical source 2}
<!-- Put only canonical rules, contracts, specs, or code here. -->

## References / Previous Inputs
None
<!-- Use this block for previous tasks, issue descriptions, old drafts, prior reports, and historical context. -->

## Decision Points
None
<!-- If the task already implies a chosen direction or trade-off, add one subsection per decision point. -->

### D-1
- Topic: {what is being decided}
- Options:
  - {option 1}
  - {option 2}
- Chosen: {selected option}
- Rationale: {why this option is chosen}

## Scope In
- {what may be changed}
- {relevant files / modules / systems in scope}

## Scope Out
- {what must not be changed}
- {explicitly excluded files / modules / systems}

## Requirements
### REQ-1
- Requirement: {clear requirement}
- Rationale: {why this is needed}
- Verification: {how this will be checked}

### REQ-2
- Requirement: {clear requirement}
- Rationale: {why this is needed}
- Verification: {how this will be checked}

## Acceptance Criteria
### AC-1
- Text: {testable criterion}
- Evidence: {what fact or artifact will confirm it}

### AC-2
- Text: {testable criterion}
- Evidence: {what fact or artifact will confirm it}

## Verification
### Automated Checks
- {command or automated validation}
- {command or automated validation}
<!-- Name real commands or automated checks. Do not leave generic placeholders in final tasks. -->

### Manual Checks
- {manual scenario or observation}
- {manual scenario or observation}
<!-- Describe the scenario and the expected observation. -->

### Acceptance Test Cases
<!-- Keep this section for development tasks. -->
<!-- For research or documentation tasks, replace this section with "Review Checklist". -->

#### ATC-1
- Scenario: {short scenario name}
- Given: {initial state}
- When: {action}
- Then: {expected result}

#### ATC-2
- Scenario: {short scenario name}
- Given: {initial state}
- When: {action}
- Then: {expected result}

## Task-Specific Contracts
None
<!-- Use this section for exact sub-contracts that do not fit safely into plain requirements. -->

### Contract: {name}
- Rule: {explicit rule}
- Rule: {explicit rule}

## Validation Gaps
None
<!-- Record what cannot be fully validated at tasking time. -->

### GAP-1
- Gap: {what cannot be validated yet}
- Impact: {why this matters}
- Mitigation: {how the gap should be handled later}

## Dependencies
- {dependency}
<!-- Replace with "None" if there are no dependencies. -->

## Blockers
- {blocker}
<!-- Replace with "None" if there are no blockers. If blockers exist, status should normally be BLOCKED. -->

## Risks
- {risk}
<!-- Replace with "None" if no material risks were identified. -->

## Assumptions
- {assumption}
<!-- Replace with "None" if no explicit assumptions are needed. -->

## Open Questions
None
<!-- If the task is BLOCKED, add one subsection per blocking question. -->

### Q-1
- Problem: {what is unclear}
- Options:
  - {option 1}
  - {option 2}
- Recommended: {recommended option}
- Needs User Input: yes | no
<!-- If user input is required, the task must not be treated as execution-ready. -->

## Recommended Approach
- {recommended implementation or execution direction}
- {important trade-off or sequencing note}
<!-- Keep this practical. Do not restate the full task description here. -->

## Deliverables
- {expected artifact 1}
- {expected artifact 2}
