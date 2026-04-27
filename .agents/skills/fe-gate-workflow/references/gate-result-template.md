# Gate Result: {Task ID} - {Task Title}

## Decision
APPROVE
<!-- Allowed values: APPROVE, REJECT -->

## Task Reference
- Task File: `.agents/tasks/<backlog|todo>/fe-XX/fe-XX.md`
- Architecture Plan: `.agents/tasks/<backlog|todo>/fe-XX/reports/architecture_plan.md`
- Implementation Report: `.agents/tasks/<backlog|todo>/fe-XX/reports/implementation_report.md`
- AQA Report: `.agents/tasks/<backlog|todo>/fe-XX/reports/aqa_report.md`
- UI Inspector Report: `.agents/tasks/<backlog|todo>/fe-XX/reports/ui_inspector_report.md`
- UX Report: `.agents/tasks/<backlog|todo>/fe-XX/reports/ux_report.md`
- Report File: `.agents/tasks/<backlog|todo>/fe-XX/reports/gate_result.md`
- Stage: `fe-gate`

## Precheck Summary
- Same Task Root: yes | no
- Required Reports Present: yes | no
- Readable Required Statuses: yes | no

## Mandatory Report Table
| Report | Exists | Status | Notes |
| --- | --- | --- | --- |
| `architecture_plan.md` | yes | READY | {note} |
| `implementation_report.md` | yes | DONE | {note} |
| `aqa_report.md` | yes | PASS | {note} |
| `ui_inspector_report.md` | yes | PASS | {note} |
| `ux_report.md` | yes | PASS | {note} |

## Git Discipline Summary
- Branch: `feature/fe-XX-<short-kebab-slug>` | invalid
- Commit Count: `{n}` | invalid
- Result: PASS | FAIL

## Evidence-Path Validation
- Result: PASS | FAIL
- Notes:
  - {evidence-path finding}

## Month-View Contract Summary
None
<!-- Use this section only when the task affects month view. -->

### Month-View Gate
- Task Affects Month View: yes
- Contract Source: `.agents/project-details/ui-specific/calendar_month_packing.md`
- Architecture Coverage: PASS | FAIL
- AQA Coverage: PASS | FAIL
- UI Coverage: PASS | FAIL
- UX Coverage: PASS | FAIL
- Result: PASS | FAIL

## Rationale
- {why the decision is APPROVE or REJECT}
- {which condition was decisive}

## Next Action
- {move to done | return to fe-architect remediation | return to fe-dev | other concrete next step}
