# Architecture Plan: {Task ID} - {Task Title}

## Plan Status
READY
<!-- Allowed values: READY, BLOCKED -->

## Task Reference
- Task File: `.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md`
- Report File: `.agents/tasks/<backlog|todo>/fe-XX/reports/architecture_plan.md`
- Stage: `fe-architect`

## Architecture Objective
{Describe the technical outcome this plan must enable.}

## Scope Guardrails
### Scope In
- {in-scope file, module, route, or boundary}

### Scope Out
- {out-of-scope file, module, route, or boundary}

## Codebase Findings
- Checked: {file or contract} -> {confirmed fact}
- Checked: {file or contract} -> {confirmed fact}
<!-- Record only inspected findings. -->

## Architecture Conflicts
None
<!-- If a conflict blocks safe execution, replace this with structured entries. -->

### ACF-1
- Conflict: {task or source mismatch}
- Impact: {why this blocks safe execution}
- Required Resolution: {what must be clarified or corrected}

## Architecture Decisions
### AD-1
- Topic: {technical decision area}
- Decision: {chosen approach}
- Rationale: {why this is the correct approach}
- Impacted Areas:
  - {file, module, or contract}

## Implementation Slices
### Slice 1
- Goal: {what this slice delivers}
- Affected Files:
  - {path}
  - {path}
- Planned Changes:
  - {change}
  - {change}
- Contract Notes:
  - {contract rule that must stay true}
- Verification Notes:
  - {what fe-dev or aqa must verify}
- Risks:
  - {slice-local risk or "None"}

### Slice 2
- Goal: {what this slice delivers}
- Affected Files:
  - {path}
- Planned Changes:
  - {change}
- Contract Notes:
  - {contract rule that must stay true}
- Verification Notes:
  - {what fe-dev or aqa must verify}
- Risks:
  - {slice-local risk or "None"}

## Integration And Data Boundaries
None
<!-- Use this section when the task affects adapters, DTO normalization, API wrappers, or server/client boundaries. -->

### Boundary 1
- Type: {adapter boundary | normalization boundary | route-handler boundary | server/client boundary}
- Location: {file or module}
- Rule: {what must live here}
- Must Not Leak:
  - {data shape or concern that must stay outside}

## Month-View Impact
None
<!-- Use this section only for month-view tasks. -->

### Month Contract
- Source: `.agents/project-details/ui-specific/calendar_month_packing.md`
- Constraints:
  - `spanning` must rank above `timed-single-day`
  - `+N more` must stay at the bottom of the day cell
  - timed single-day events must keep visible start time
- Impact:
  - {which slice or module must preserve this behavior}

## Risks And Mitigations
- Risk: {risk}
  - Mitigation: {mitigation}

## Handoff To `fe-dev`
- First Slice To Implement: {slice name}
- Stable Contracts To Preserve:
  - {contract}
- Verification Focus:
  - {flow or check}
- Stop And Escalate If:
  - {condition}

## Remediation Strategy
- Trigger: `fe-gate` returns `REJECT`
- Required Inputs:
  - `gate_result.md`
  - `implementation_report.md`
  - `aqa_report.md`
  - `ui_inspector_report.md`
  - `ux_report.md`
- Update Rule:
  - revise only the affected decisions, slices, boundaries, risks, or handoff criteria
- Next Step:
  - hand the updated plan back to `fe-dev`

## Open Questions
None
<!-- If the plan is BLOCKED, list the unresolved points here. -->

### Q-1
- Problem: {what is unresolved}
- Why It Matters: {why execution is unsafe without an answer}
- Needed Input: {what must be clarified}
