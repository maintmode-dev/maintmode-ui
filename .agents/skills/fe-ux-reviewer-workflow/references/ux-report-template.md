# UX Report: {Task ID} - {Task Title}

## Report Status
PASS
<!-- Allowed values: PASS, FAIL -->

## Task Reference
- Task File: `.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md`
- Implementation Report: `.agents/tasks/<backlog|todo>/fe-XX/reports/implementation_report.md`
- AQA Report: `.agents/tasks/<backlog|todo>/fe-XX/reports/aqa_report.md`
- Report File: `.agents/tasks/<backlog|todo>/fe-XX/reports/ux_report.md`
- Stage: `fe-ux-reviewer`

## Review Scope
- Changed UX Surface:
  - {component, page, route, flow, or "None"}
- Checked Inputs:
  - `.agents/project-details/ui-specific/ux_heuristics.md`
  - {other inspected artifact}

## UX Change Assessment
- Material UX Change: yes | no
- Summary: {what changed in the user experience, or why the task does not materially affect UX}

## Heuristic Checklist
### H-01 Visual hierarchy
- Status: PASS | FAIL | NOT_APPLICABLE
- Observation: {observable UX fact}

### H-02 Readability
- Status: PASS | FAIL | NOT_APPLICABLE
- Observation: {observable UX fact}

### H-03 Consistency
- Status: PASS | FAIL | NOT_APPLICABLE
- Observation: {observable UX fact}

### H-04 Cognitive load
- Status: PASS | FAIL | NOT_APPLICABLE
- Observation: {observable UX fact}

### H-05 Risk visibility
- Status: PASS | FAIL | NOT_APPLICABLE
- Observation: {observable UX fact}

### H-06 Affordance
- Status: PASS | FAIL | NOT_APPLICABLE
- Observation: {observable UX fact}

### H-07 Information density
- Status: PASS | FAIL | NOT_APPLICABLE
- Observation: {observable UX fact}

## Issues
None
<!-- Use this section only for actual heuristic failures or material UX risks. -->

### UX-1
- Heuristic: {H-XX}
- Severity: {low | medium | high | critical}
- Issue: {what was observed}
- Impact: {why this creates user or operator risk}

## Evidence
None
<!-- Keep every path inside the same task root. -->

### Evidence 1
- Type: {screenshot | recording | trace | note}
- Path: `.agents/tasks/<backlog|todo>/fe-XX/artifacts/{type}/{file}`
- Supports:
  - {heuristic or issue}

## Notes For Gate
- Summary: {formal pass/fail summary}
- Gate Risk:
  - {what gate should know}
