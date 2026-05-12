# Maintenance Details Feature

Owns the maintenance details panel, its data hooks, and its action mutations.

## Composition

- `components/maintenance-details-sheet.tsx` — controlled by `?maintenance=<id>`
  on the calendar page. Read-only summary view (status, planned/actual time,
  scope, impact, resources, conflicts) plus action buttons gated by
  `summary.actions` from the backend.
- `components/cancel-dialog.tsx` — confirmation modal for the cancel action.
  Forwards `{ reason, comment }` to `useMaintenanceActionMutation`.

## Data layer

- `queries/query-keys.ts` — `maintenanceDetailsQueryKeys.detail(id)` is the
  per-maintenance key. Each mutation invalidates `calendarQueryKeys.all`
  plus the specific `detail(id)`.
- `queries/use-maintenance-details-query.ts` — hook backed by
  `GET /api/maintenance/[id]`.
- `mutations/use-maintenance-action-mutation.ts` — single hook for
  `approve | start | finish | cancel`. Posts to
  `POST /api/maintenance/[id]/actions/[action]` and centralises invalidation.
- `mutations/use-create-maintenance-mutation.ts`,
  `mutations/use-update-maintenance-mutation.ts` — POST/PATCH wrappers used by
  RUK-19 (steps form). The hooks are exported from this slice so RUK-19 only
  has to add its UI.

## Out of scope (until RUK-19)

- Create/edit form with the `steps[]` flow.
- Inline edit of planned start/end inside the sheet.

## Boundaries

- The sheet never imports backend DTOs; everything goes through the domain
  `MaintenanceSummary`.
- Action errors surface as a `BffError` from `bffFetch`; the sheet renders
  `error.message` directly.
