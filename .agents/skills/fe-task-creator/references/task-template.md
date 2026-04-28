# {Task Title}
<!-- Write a short, specific technical-English title. Do not use generic names like "Fix frontend" or "Improve UI". -->

## Status
READY
<!-- READY: enough confirmed information exists to start work safely and verify completion. -->
<!-- BLOCKED: required information, decisions, contracts, or dependencies are still missing; implementation must not start. -->

## Task ID
fe-XX
<!-- For Linear-backed tasks, replace with the Linear issue key or number, for example RUK-123. -->
<!-- Use lowercase fe-XX only for local task directories and local task files. -->

## Task File
.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md
<!-- Allowed canonical paths: .agents/tasks/backlog/fe-XX/fe-XX.md or .agents/tasks/todo/fe-XX/fe-XX.md -->
<!-- For Linear-backed tasks, replace with the Linear issue key or number after creation, not a local fe-XX/fe-XX.md path. -->
<!-- Report, artifact, and deliverable paths must use one planned execution root. For Linear-backed tasks, replace fe-XX with the Linear issue key or number. -->

## Task Path Status
canonical
<!-- linear: task is stored in Linear through the bundled Linear plugin. -->
<!-- When linear, Task ID and Task File must both be the Linear issue key or number. -->
<!-- canonical: Task File matches .agents/tasks/backlog/fe-XX/fe-XX.md or .agents/tasks/todo/fe-XX/fe-XX.md -->
<!-- override-approved: the user explicitly requested a non-canonical path and the full task pack lives under that override root -->

### Override Reason
None
<!-- Remove this subsection entirely when Task Path Status = canonical or linear. -->
<!-- Keep it only when Task Path Status = override-approved. -->

## Task Type
feature
<!-- Allowed types: feature, bugfix, refactor, integration, research, documentation, qa -->

## Priority
high
<!-- Allowed values: high, medium, low -->

## Primary Role
frontend developer
<!-- Allowed baseline roles: frontend developer, frontend architect, analyst, qa engineer -->

## Supporting Roles
None
<!-- If supporting roles are needed, list them. Otherwise keep "None". -->

## Task Description
{Describe the task in 2-5 sentences without adding unconfirmed facts.}
<!-- Write the full task file in concise technical English. -->
<!-- Do not mix Russian and English prose inside the task body. -->

## Business Goal
{Explain why this task matters for the business, user, or team.}
{State which risk, limitation, or loss should be removed after completion.}

## Project Context
{Add only the project context that is actually needed to execute this task.}

## Discovery Summary
### What Was Checked
- {file / document / contract / task / artifact}
- {file / document / contract / task / artifact}

### Findings
- {confirmed fact}
- {identified constraint}
<!-- Record only what discovery actually confirmed. Do not mix assumptions into this section. -->

## Source of Truth
- AGENTS.md
- {canonical source of truth}
- {canonical source of truth}
<!-- Put only canonical docs, contracts, rules, code, or approved specs here. -->
<!-- Every item listed here must also appear in Discovery Summary -> What Was Checked. -->

## References / Previous Inputs
None
<!-- Use this block for previous tasks, old reports, historical notes, and other non-canonical inputs. -->

## Verification Inputs
None
<!-- Use this block for tests, smoke specs, fixtures, test configs, and other verification artifacts that are not source of truth. -->
<!-- Do not place tests or smoke specs into Source of Truth by default. -->

## Decision Points
None
<!-- If the task already implies a selected trade-off or decision, record it explicitly. -->

### D-1
- Topic: {what is being decided}
- Options:
  - {option 1}
  - {option 2}
- Chosen: {selected option}
- Rationale: {why this option is selected}

## Scope In
- {what may be changed}
- {which files / modules / routes are in scope}

## Scope Out
- {what must not be changed}
- {which files / modules / routes are explicitly out of scope}

## Constraints
- {constraint 1}
- {constraint 2}
- {constraint 3}
<!-- Add only confirmed project constraints. -->

## Frontend Requirements
### Functional
#### FR-1
- Requirement: {what exactly must be implemented}
- Rationale: {why this is needed}
- Verification: {how this will be checked}

### UI/UX
#### UX-1
- Requirement: {which UI/UX requirement must be satisfied}
- Rationale: {why this matters}
- Verification: {how this will be checked}

### API / Contract
#### API-1
- Requirement: {which contract or data-layer requirement must be satisfied}
- Rationale: {why this matters}
- Verification: {how this will be checked}

### Non-Functional
#### NFR-1
- Requirement: {which non-functional requirement must be satisfied}
- Rationale: {why this matters}
- Verification: {how this will be checked}

### Edge Cases
#### EC-1
- Case: {edge-case scenario}
- Expected Handling: {expected system behavior}
- Verification: {how this will be checked}

## UI States
- loading: {how it should be handled or why it is not affected}
- empty: {how it should be handled or why it is not affected}
- error: {how it should be handled or why it is not affected}
- conflict: {how it should be handled or why it is not affected}
- success: {expected successful outcome}
<!-- Explicitly state whether the task affects each of these states. -->

## Acceptance Criteria
### AC-1
- Text: {testable criterion}
- Evidence: {what fact, artifact, or report will confirm it}

### AC-2
- Text: {testable criterion}
- Evidence: {what fact, artifact, or report will confirm it}

## Routing Contract
None
<!-- Use for deep links, back-navigation, query params, router state, and restore logic. -->

## Interaction Contract
None
<!-- Use for CTA behavior, disabled or hidden states, action hierarchy, and transitions between UI states. -->

## Data Contract
None
<!-- Use for DTO mapping, normalization, status or time conversion, and shape constraints. -->

## Designer Contract
None
<!-- Use for approved UI specs, block order, layout rules, and visual contract. -->

## Task-Specific Contracts
None
<!-- Use for additional exact contracts that do not fit the named sections above. -->

### TSC-1
- Name: {contract name}
- Rules:
  - {explicit rule 1}
  - {explicit rule 2}
- Verification: {how this contract will be checked}

## Verification Matrix
### Automated Checks
- bun run lint
- bun run build
- {exact test or validation command}
<!-- If scope includes tests, smoke, or route handlers, this section must include an exact command or explain the gap in Testing Gaps. -->

### Manual Matrix
#### VM-1
- Scenario: {short scenario name}
- Entry: {initial state}
- Action: {what the user does}
- Expected Result: {expected result}

### Acceptance Test Cases
<!-- This section is required for code tasks. -->
<!-- For research or documentation tasks, replace it with Review Checklist. -->

#### ATC-1
- Scenario: {short scenario name}
- Given: {initial state}
- When: {action}
- Then: {expected result}

### Testing Gaps
None
<!-- Record what should be checked but cannot yet be verified by a concrete command or environment. -->
<!-- Keep only test, harness, or environment limitations here. -->

## Selected Skills
### SK-1
- Name: fe-task-creator
- Source: .agents
- Reason: canonical frontend tasking skill

### SK-2
- Name: fe-architect-workflow
- Source: legacy (.kilocode)
- Reason: architecture stage of the frontend workflow
<!-- Keep the selected skill set minimally sufficient. -->
<!-- If a skill has a .agents equivalent, use Source: .agents. -->
<!-- If a skill exists only in .kilocode, mark it as legacy (.kilocode). -->
<!-- For READY tasks, include the full execution skill set here. -->
<!-- For BLOCKED tasks, include `fe-task-creator` and only the skills needed to remove the blocker; future execution skills must be marked in Reason as planned after unblock. -->

## Execution Workflow
- Entry Mode: fe-architect
- Execution Mode: fe-dev
- Workflow Sequence: fe-architect -> fe-dev -> fe-ui-inspector + fe-ux-reviewer -> fe-gate

## Execution Agents
### fe-architect
- Goal: {what the architect must do}
- Deliverable: .agents/tasks/<backlog|todo>/fe-XX/reports/architecture_plan.md
<!-- Use one consistent planned task root: backlog or todo. -->

### fe-dev
- Goal: {what the developer must do}
- Deliverables:
  - .agents/tasks/<backlog|todo>/fe-XX/reports/implementation_report.md
  - .agents/tasks/<backlog|todo>/fe-XX/reports/aqa_report.md

### fe-ui-inspector
- Goal: {what the UI reviewer must check}
- Deliverable: .agents/tasks/<backlog|todo>/fe-XX/reports/ui_inspector_report.md

### fe-ux-reviewer
- Goal: {what the UX reviewer must check}
- Deliverable: .agents/tasks/<backlog|todo>/fe-XX/reports/ux_report.md

### fe-gate
- Goal: {what the gate stage must decide}
- Deliverable: .agents/tasks/<backlog|todo>/fe-XX/reports/gate_result.md

## Implementation Plan
- {step 1}
- {step 2}
- {step 3}
- {step 4}
<!-- The plan must be executable and should move from discovery or architecture into implementation and verification. -->

## Git Plan
- Branch: feature/fe-XX-short-kebab-slug
- Commit Convention: <type>(fe-XX): <summary>
- Allowed Types: feat, fix, refactor, test, docs, chore, perf
- Max Commits: 5
- Planned Commits:
  - {commit 1}
  - {commit 2}
  - {commit 3}

## Deliverables
- .agents/tasks/<backlog|todo>/fe-XX/fe-XX.md
- .agents/tasks/<backlog|todo>/fe-XX/reports/architecture_plan.md
- .agents/tasks/<backlog|todo>/fe-XX/reports/implementation_report.md
- .agents/tasks/<backlog|todo>/fe-XX/reports/aqa_report.md
- .agents/tasks/<backlog|todo>/fe-XX/reports/ui_inspector_report.md
- .agents/tasks/<backlog|todo>/fe-XX/reports/ux_report.md
- .agents/tasks/<backlog|todo>/fe-XX/reports/gate_result.md
- .agents/tasks/<backlog|todo>/fe-XX/artifacts/screenshots/*
- .agents/tasks/<backlog|todo>/fe-XX/artifacts/evidence/*
<!-- For Linear-backed tasks, replace the local task file deliverable with the Linear issue key or number. -->
<!-- All local paths above must use one consistent planned task root. -->

## Stage Outputs
- fe-architect -> .agents/tasks/<backlog|todo>/fe-XX/reports/architecture_plan.md
- fe-dev -> .agents/tasks/<backlog|todo>/fe-XX/reports/implementation_report.md
- fe-dev -> .agents/tasks/<backlog|todo>/fe-XX/reports/aqa_report.md
- fe-ui-inspector -> .agents/tasks/<backlog|todo>/fe-XX/reports/ui_inspector_report.md
- fe-ux-reviewer -> .agents/tasks/<backlog|todo>/fe-XX/reports/ux_report.md
- fe-gate -> .agents/tasks/<backlog|todo>/fe-XX/reports/gate_result.md
<!-- For Linear-backed tasks, replace fe-XX in local report and artifact paths with the Linear issue key or number. -->
<!-- Do not mix backlog and todo roots inside the same task pack. -->

## Dependencies
None
<!-- If dependencies exist, list specific tasks, contracts, designs, or external decisions. -->

## Blockers
None
<!-- If blockers exist, the task status should normally be BLOCKED. -->

## Risks
- {risk}
<!-- If no material risks were identified, write None. -->

## Assumptions
- {assumption}
<!-- If no explicit assumptions are needed, write None. -->

## Validation Gaps
None
<!-- Use this section for broader validation gaps that are not limited to tests. -->
<!-- Do not duplicate Testing Gaps here unless there is an additional broader product impact. -->

### GAP-1
- Gap: {what cannot yet be fully validated}
- Impact: {why this matters}
- Mitigation: {how this gap should be handled later}

## Open Questions
None
<!-- For READY tasks, keep this as None. -->
<!-- For BLOCKED tasks, add one subsection per blocking point. -->

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
- {important trade-off, sequencing note, or constraint}
