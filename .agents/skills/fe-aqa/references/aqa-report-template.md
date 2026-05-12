# AQA Report: {Task ID} - {Task Title}

## Report Status
PASS
<!-- Allowed values: PASS, FAIL -->

## Task Reference
- Task File: `.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md`
- Implementation Report: `.agents/tasks/<backlog|todo>/fe-XX/reports/implementation_report.md`
- Architecture Plan: `.agents/tasks/<backlog|todo>/fe-XX/reports/architecture_plan.md`
- Report File: `.agents/tasks/<backlog|todo>/fe-XX/reports/aqa_report.md`
- Stage: `fe-dev`

## Automated Checks
- `{command}` -> PASS | FAIL | NOT_RUN
- `{command}` -> PASS | FAIL | NOT_RUN
<!-- Record exact commands. Do not summarize multiple different checks under one generic bullet. -->

## Manual Technical Checks
None
<!-- Use this section for manual technical flows such as smoke checks, route verification, console validation, or scenario-driven technical confirmation. -->

### Manual Check 1
- Scenario: {short scenario name}
- Result: PASS | FAIL | NOT_RUN
- Observation: {what was observed}

## Findings Or Bugs
None
<!-- Use this section for technical defects or regressions discovered during validation. -->

### AQA-1
- Severity: {low | medium | high | critical}
- Finding: {what failed or regressed}
- Impact: {why this matters}
- Reproduction: {how to reproduce or observe it}

## Testing Gaps
None
<!-- Use this section for unavailable commands, missing fixtures, environment blockers, or missing coverage that affects confidence. -->

### GAP-1
- Gap: {what could not be validated}
- Reason: {why it could not be validated}
- Impact: {how this affects confidence}
- Next Step: {what should happen next}

## Evidence
None
<!-- Keep every path inside the same task root. -->

### Evidence 1
- Type: {log | screenshot | trace | report | command output}
- Path: `.agents/tasks/<backlog|todo>/fe-XX/artifacts/{type}/{file}`
- Notes: {why this evidence matters}

## Handoff Notes
- Technical Baseline: {what downstream reviewers can trust}
- Review Focus:
  - {what `fe-ui-inspector` should pay attention to}
  - {what `fe-ux-reviewer` should pay attention to}
- Return To `fe-dev` If:
  - {condition that requires another implementation cycle}
