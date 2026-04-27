# UI Inspector Report: {Task ID} - {Task Title}

## Report Status
PASS
<!-- Allowed values: PASS, FAIL -->

## Task Reference
- Task File: `.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md`
- Implementation Report: `.agents/tasks/<backlog|todo>/fe-XX/reports/implementation_report.md`
- AQA Report: `.agents/tasks/<backlog|todo>/fe-XX/reports/aqa_report.md`
- Report File: `.agents/tasks/<backlog|todo>/fe-XX/reports/ui_inspector_report.md`
- Stage: `fe-ui-inspector`

## Inspection Scope
- Changed UI Surface:
  - {component, page, route, or "None"}
- Checked Inputs:
  - `.agents/project-details/ui-specific/ui_rules.md`
  - {other inspected artifact}

## UI Change Assessment
- Material UI Change: yes | no
- Summary: {what changed visually, or why the task does not materially affect UI}

## Rule Checklist
### RULE-01 Visibility
- Status: PASS | FAIL | NOT_APPLICABLE
- Observation: {observable fact}

### RULE-02 Minimum size
- Status: PASS | FAIL | NOT_APPLICABLE
- Observation: {observable fact}

### RULE-03 Conflict indicator
- Status: PASS | FAIL | NOT_APPLICABLE
- Observation: {observable fact}

### RULE-04 Planned vs Actual
- Status: PASS | FAIL | NOT_APPLICABLE
- Observation: {observable fact}

### RULE-05 Overlap readability
- Status: PASS | FAIL | NOT_APPLICABLE
- Observation: {observable fact}

### RULE-06 Overflow behavior
- Status: PASS | FAIL | NOT_APPLICABLE
- Observation: {observable fact}

### RULE-07 Semantic colors
- Status: PASS | FAIL | NOT_APPLICABLE
- Observation: {observable fact}

### RULE-08 Empty/error/loading states
- Status: PASS | FAIL | NOT_APPLICABLE
- Observation: {observable fact}

### RULE-09 Interaction affordance
- Status: PASS | FAIL | NOT_APPLICABLE
- Observation: {observable fact}

### RULE-10 Fail-first
- Status: PASS | FAIL | NOT_APPLICABLE
- Observation: {state whether every relevant inspected rule was verifiable}

### RULE-11 Month packing priority
- Status: PASS | FAIL | NOT_APPLICABLE
- Observation: {observable fact}

## Violations
None
<!-- Use this section only for actual rule failures. -->

### UI-1
- Rule: {RULE-XX}
- Severity: {low | medium | high | critical}
- Violation: {what was observed}
- Impact: {why this violates the rule}

## Evidence
None
<!-- Keep every path inside the same task root. -->

### Evidence 1
- Type: {screenshot | recording | trace | note}
- Path: `.agents/tasks/<backlog|todo>/fe-XX/artifacts/{type}/{file}`
- Supports:
  - {rule or violation}

## Notes For Gate
- Summary: {formal pass/fail summary}
- Gate Risk:
  - {what gate should know}
